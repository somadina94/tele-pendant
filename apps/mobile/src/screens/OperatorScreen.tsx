import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  formatOverlay,
  isClusterMetricRegister,
  isOperatorScreenReady,
  MATRIX_CELL_STATE_CODE,
  MATRIX_CELL_STATE_I18N,
  operatorNeedsLiveTags,
  resolveMatrixCellUiState,
  nextLiveTagsCursor,
  shouldApplyLiveTags,
  tagValueForRegister,
  type TagSnapshot,
} from '@tele-pendant/shared';
import { io, Socket } from 'socket.io-client';
import { operatorApiError } from '../api-errors';
import { apiGet, apiPost, getApiBase } from '../api';
import type { Cell, ControlLease, Layout } from '../types';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import {
  hapticHoldStart,
  hapticMotionBlocked,
  isMotionBlockedError,
} from '../haptics';
import { CraneMimic } from '../crane-mimic';
import { ESTOP, matrixCellStatePalette } from '../hmi-styles';
import { useTheme } from '../theme';
import { getStoredUser } from '../user-session';
import { Card, showErrorAlert } from '../ui';

type SafetySnap = {
  mode: string;
  eStopActive?: boolean;
  deadmanActive?: boolean;
  watchdogOk?: boolean;
  control?: ControlLease;
};

function mergeControl(
  incoming: ControlLease | null | undefined,
  prev: ControlLease | null,
  localUserId: string | null,
): ControlLease | null {
  if (!incoming) return prev;
  return {
    ...incoming,
    youHold: Boolean(
      incoming.youHold ||
      (localUserId &&
        incoming.holderUserId &&
        localUserId === incoming.holderUserId),
    ),
  };
}

function statusTone(mode: string): 'ok' | 'warn' | 'danger' {
  if (mode === 'safe_state' || mode === 'estop' || mode === 'e_stop') {
    return 'danger';
  }
  if (mode !== 'normal' && mode !== 'unknown') return 'warn';
  return 'ok';
}

/** Resolve /hmi-assets/… paths against the API origin for React Native. */
function resolvePlantImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const origin = getApiBase().replace(/\/api\/v1\/?$/, '');
  return `${origin}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

export function OperatorScreen({ token }: { token: string }) {
  const { t, terror } = useLocale();
  const { theme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const statePalette = matrixCellStatePalette(theme === 'dark');
  const [pin, setPin] = useState('');
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [jogSpeed, setJogSpeed] = useState<'slow' | 'fast'>('fast');
  const jogSpeedRef = useRef<'slow' | 'fast'>('fast');
  const [safety, setSafety] = useState<SafetySnap>({ mode: 'unknown' });
  const [control, setControl] = useState<ControlLease | null>(null);
  const controlRef = useRef<ControlLease | null>(null);
  const localUserIdRef = useRef<string | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [tags, setTags] = useState<TagSnapshot | null>(null);

  const applyControl = useCallback(
    (
      incoming: ControlLease | null | undefined,
      prev: ControlLease | null,
    ): ControlLease | null =>
      mergeControl(incoming, prev, localUserIdRef.current),
    [],
  );

  useEffect(() => {
    controlRef.current = control;
  }, [control]);

  useEffect(() => {
    jogSpeedRef.current = jogSpeed;
  }, [jogSpeed]);

  useEffect(() => {
    let cancelled = false;
    void getStoredUser().then((user) => {
      if (!cancelled) localUserIdRef.current = user?.id?.trim() || null;
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const [photoOk, setPhotoOk] = useState(true);
  const [liveFallback, setLiveFallback] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const heldId = useRef<string | null>(null);
  /** Bumps on release so in-flight activate(true) cannot leave a coil latched. */
  const holdGen = useRef(0);
  const activatingId = useRef<string | null>(null);
  /** Release arrived while activate(true) was still in flight — finish after pressCell. */
  const releaseAfterActivate = useRef<string | null>(null);
  const tagOrderRef = useRef<{ lastSeq: number; lastAt: string | null }>({
    lastSeq: 0,
    lastAt: null,
  });
  const tagsPullInFlight = useRef(false);
  const lastWsTagAt = useRef(0);

  const applyLiveTags = useCallback((payload: TagSnapshot & { at?: string }) => {
    if (
      !shouldApplyLiveTags(
        tagOrderRef.current.lastSeq,
        tagOrderRef.current.lastAt,
        payload,
      )
    ) {
      return;
    }
    tagOrderRef.current = nextLiveTagsCursor(tagOrderRef.current, payload);
    if (typeof payload.hoistHeightMm === 'number') {
      setHeight(payload.hoistHeightMm);
    }
    setTags(payload);
  }, []);

  useEffect(() => {
    let socket: Socket | null = null;
    let closed = false;
    const base = getApiBase();
    if (closed) return;
    const origin = base.replace(/\/api\/v1$/, '');
    socket = io(`${origin}/realtime`, {
      transports: ['websocket', 'polling'],
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: Infinity,
      auth: token ? { token } : {},
    });
    socketRef.current = socket;
    socket.on('safety.state', (s: SafetySnap) => {
      setSafety(s);
      if (s.control) {
        setControl((prev) => applyControl(s.control, prev));
      }
    });
    socket.on('tags.update', (payload: TagSnapshot) => {
      lastWsTagAt.current = Date.now();
      applyLiveTags(payload);
    });
    return () => {
      closed = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [token, applyControl, applyLiveTags]);

  /** HTTP tags only when Socket.IO has gone quiet (prod proxy stall). */
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const socket = socketRef.current;
      if (socket?.connected && Date.now() - lastWsTagAt.current < 4_000) {
        return;
      }
      if (tagsPullInFlight.current) return;
      tagsPullInFlight.current = true;
      try {
        const payload = await apiGet<TagSnapshot & { at: string | null }>(
          '/realtime/tags',
          token,
        );
        if (cancelled || payload.at == null) return;
        applyLiveTags(payload);
      } catch {
        // ignore
      } finally {
        tagsPullInFlight.current = false;
      }
    };
    void pull();
    const id = setInterval(pull, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token, applyLiveTags]);

  /** FEAT-A5: exclusive control claim + heartbeat while Operator is open. */
  useEffect(() => {
    let cancelled = false;
    const apply = (next: ControlLease) => {
      if (!cancelled) setControl((prev) => applyControl(next, prev));
    };
    const refresh = async () => {
      try {
        apply(await apiGet<ControlLease>('/safety/control', token));
      } catch {
        // ignore
      }
    };
    void (async () => {
      try {
        apply(
          await apiPost<ControlLease>(
            '/safety/control/claim',
            undefined,
            token,
          ),
        );
      } catch {
        await refresh();
      }
    })();
    const id = setInterval(() => {
      if (controlRef.current?.youHold) {
        void apiPost<ControlLease>(
          '/safety/control/heartbeat',
          undefined,
          token,
        )
          .then(apply)
          .catch(() => void refresh());
      } else {
        void refresh();
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
      void apiPost('/safety/control/release', undefined, token).catch(
        () => undefined,
      );
    };
  }, [token, applyControl]);

  const layoutQuery = useQuery({
    queryKey: ['layout', token],
    queryFn: () => apiGet<Layout>('/hmi/layout', token),
  });

  const pulseDeadman = useCallback(async () => {
    // WS only — HTTP pulse/release doubled Modbus coil drops with the WS path.
    socketRef.current?.emit('deadman.pulse');
  }, []);

  const releaseDeadman = useCallback(() => {
    socketRef.current?.emit('deadman.release');
  }, []);

  const dropMotionCoil = useCallback(
    async (cellId: string) => {
      try {
        await apiPost(
          `/hmi/cells/${cellId}/activate`,
          { value: false, speed: jogSpeedRef.current },
          token,
        );
      } catch {
        // Best-effort coil drop.
      }
    },
    [token],
  );

  const finishMotionRelease = useCallback(
    (cellId: string) => {
      releaseAfterActivate.current = null;
      setHoldingId((current) => (current === cellId ? null : current));
      releaseDeadman();
      // Fire-and-forget — awaiting coil-off stacked Modbus behind the next press.
      void dropMotionCoil(cellId);
    },
    [dropMotionCoil, releaseDeadman],
  );

  // Match the local working hold path: WS deadman pulse only (no HTTP flood).
  useEffect(() => {
    if (!holdingId) return;
    const pulse = () => {
      socketRef.current?.emit('deadman.pulse');
    };
    pulse();
    const id = setInterval(pulse, 400);
    return () => clearInterval(id);
  }, [holdingId]);

  const pressCell = async (cell: Cell) => {
    const pressGen = holdGen.current;
    if (cell.isMotion && !controlRef.current?.youHold) {
      showErrorAlert(
        controlRef.current?.held
          ? `${t('controlHeldBy')} ${controlRef.current.holderDisplayName || controlRef.current.holderUserId}`
          : t('err.control'),
      );
      void hapticMotionBlocked();
      return;
    }
    if (cell.isMotion) {
      heldId.current = cell.id;
      setHoldingId(cell.id);
      releaseAfterActivate.current = null;
      void hapticHoldStart();
    }
    activatingId.current = cell.id;
    const speed =
      cell.isMotion && (cell.variableSpeed ?? true)
        ? jogSpeedRef.current
        : undefined;
    try {
      if (cell.isMotion) {
        await pulseDeadman();
      }
      await apiPost(
        `/hmi/cells/${cell.id}/activate`,
        { value: true, ...(speed ? { speed } : {}) },
        token,
      );
    } catch (err) {
      if (cell.isMotion && isMotionBlockedError(err)) {
        void hapticMotionBlocked();
      }
      showErrorAlert(
        operatorApiError(
          err,
          cell.style === 'estop' ? 'stop' : 'reset',
          terror,
        ),
      );
      if (heldId.current === cell.id) {
        heldId.current = null;
        setHoldingId(null);
        if (cell.isMotion) releaseDeadman();
      }
      releaseAfterActivate.current = null;
      return;
    } finally {
      if (activatingId.current === cell.id) {
        activatingId.current = null;
      }
    }
    if (cell.isMotion && releaseAfterActivate.current === cell.id) {
      finishMotionRelease(cell.id);
      return;
    }
    if (
      cell.isMotion &&
      (heldId.current !== cell.id || holdGen.current !== pressGen)
    ) {
      void dropMotionCoil(cell.id);
      if (heldId.current === null) releaseDeadman();
    }
  };

  const releaseCell = (cell: Cell) => {
    if (!cell.isMotion) return;
    const mine = heldId.current === cell.id;
    if (heldId.current === cell.id) heldId.current = null;
    if (!mine) return;
    holdGen.current += 1;
    if (activatingId.current === cell.id) {
      releaseAfterActivate.current = cell.id;
      return;
    }
    finishMotionRelease(cell.id);
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        const id = heldId.current;
        heldId.current = null;
        holdGen.current += 1;
        setHoldingId(null);
        releaseDeadman();
        if (!id) return;
        const cell = layoutQuery.data?.cells.find((row) => row.id === id);
        if (!cell?.isMotion) return;
        void apiPost(`/hmi/cells/${id}/activate`, { value: false }, token);
      }
    });
    return () => sub.remove();
  }, [layoutQuery.data?.cells, releaseDeadman, token]);

  const resetEStop = async () => {
    try {
      await apiPost('/safety/reset', { pin }, token);
    } catch (err) {
      showErrorAlert(operatorApiError(err, 'reset', terror));
    }
  };

  const claimControl = async () => {
    try {
      setControl(
        applyControl(
          await apiPost<ControlLease>(
            '/safety/control/claim',
            undefined,
            token,
          ),
          null,
        ),
      );
    } catch (err) {
      showErrorAlert(err instanceof Error ? err.message : t('err.control'));
      try {
        setControl(
          applyControl(
            await apiGet<ControlLease>('/safety/control', token),
            null,
          ),
        );
      } catch {
        // ignore
      }
    }
  };

  const releaseControl = async () => {
    try {
      setControl(
        applyControl(
          await apiPost<ControlLease>(
            '/safety/control/release',
            undefined,
            token,
          ),
          null,
        ),
      );
    } catch (err) {
      showErrorAlert(err instanceof Error ? err.message : 'Release failed');
    }
  };

  const stealControl = async () => {
    try {
      setControl(
        applyControl(
          await apiPost<ControlLease>('/safety/control/steal', { pin }, token),
          null,
        ),
      );
    } catch (err) {
      showErrorAlert(operatorApiError(err, 'reset', terror));
    }
  };

  const youHold = Boolean(control?.youHold);
  const controlHeldByOther = Boolean(control?.held && !youHold);

  const rawImageUrl = layoutQuery.data?.background?.imageUrl ?? '';
  const imageUrl = resolvePlantImageUrl(rawImageUrl);
  const cssBackground =
    layoutQuery.data?.background?.cssBackground?.trim() || '';
  // RN View only accepts solid colors (not CSS gradients).
  const solidBackground =
    cssBackground && !/[()]/.test(cssBackground) ? cssBackground : '';
  const safetyMode = safety.mode;
  const tone = statusTone(safetyMode);
  const screens = layoutQuery.data?.backgrounds ?? [];
  const useCustomGraphic = Boolean(imageUrl && photoOk);
  useEffect(() => {
    setPhotoOk(true);
  }, [imageUrl]);

  async function switchScreen(id: string) {
    if (layoutQuery.data?.background?.id === id) return;
    try {
      await apiPost(`/hmi/backgrounds/${id}/activate`, {}, token);
      await layoutQuery.refetch();
    } catch (err) {
      showErrorAlert(
        err instanceof Error ? err.message : 'Could not switch screen',
      );
    }
  }

  const grid = useMemo(() => {
    const layout = layoutQuery.data;
    if (!layout) return null;
    const map = new Map(layout.cells.map((c) => [`${c.row}:${c.col}`, c]));
    const cells: Array<Cell | null> = [];
    for (let r = 0; r < layout.matrix.rows; r++) {
      for (let c = 0; c < layout.matrix.cols; c++) {
        cells.push(map.get(`${r}:${c}`) ?? null);
      }
    }
    return { cols: layout.matrix.cols, cells };
  }, [layoutQuery.data]);

  const showJogSpeed = useMemo(
    () =>
      Boolean(
        layoutQuery.data?.cells.some(
          (cell) => cell.isMotion && (cell.variableSpeed ?? true),
        ),
      ),
    [layoutQuery.data?.cells],
  );

  /** Phone: 1 col; tablet-wide: honor layout matrix cols. */
  const matrixCols = windowWidth >= 768 ? Math.max(1, grid?.cols ?? 1) : 1;
  const matrixGap = 8;
  const matrixPad = 24;
  const matrixCellWidth =
    (windowWidth - matrixPad - matrixGap * (matrixCols - 1)) / matrixCols;

  const needsLive = useMemo(
    () => operatorNeedsLiveTags(layoutQuery.data),
    [layoutQuery.data],
  );

  useEffect(() => {
    if (!needsLive || tags) {
      setLiveFallback(false);
      return;
    }
    const id = setTimeout(() => setLiveFallback(true), 2500);
    return () => clearTimeout(id);
  }, [needsLive, tags, layoutQuery.data]);

  const operatorReady = isOperatorScreenReady({
    layoutLoaded: Boolean(layoutQuery.data),
    gridReady: Boolean(grid),
    needsLive,
    hasTags: tags !== null,
    liveFallback,
  });

  if (layoutQuery.isError) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="text-center text-sm text-destructive">
          {layoutQuery.error instanceof Error
            ? layoutQuery.error.message
            : 'Could not load operator screen'}
        </Text>
      </View>
    );
  }

  if (!operatorReady) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#3D9CFD" />
        <Text className="mt-2 text-sm text-muted-foreground">
          {t('operator')}
        </Text>
      </View>
    );
  }

  const stopCell =
    layoutQuery.data?.cells.find(
      (cell) =>
        cell.style === 'estop' || cell.label.trim().toUpperCase() === 'STOP',
    ) ?? null;

  const renderMobileCell = (cell: Cell) => {
    const isEstop = cell.style === 'estop';
    const cellState = resolveMatrixCellUiState({
      style: cell.style,
      isMotion: cell.isMotion,
      isHolding: holdingId === cell.id,
      safety,
      tags,
      statusRegisterName: cell.statusRegister?.name,
    });
    const palette = isEstop
      ? {
          background: ESTOP.background,
          border: ESTOP.border,
          foreground: ESTOP.foreground,
          chip: 'rgba(255,255,255,0.22)',
        }
      : statePalette[cellState];
    const stateLabel = t(MATRIX_CELL_STATE_I18N[cellState]);
    const metaColor = isEstop ? 'rgba(255,255,255,0.85)' : palette.foreground;
    const metaParts: string[] = [];
    if (cell.feedbackRegister) {
      metaParts.push(
        `F ${String(tagValueForRegister(tags, cell.feedbackRegister.name))}`,
      );
    }
    if (cell.statusRegister) {
      metaParts.push(
        `S ${String(tagValueForRegister(tags, cell.statusRegister.name))}`,
      );
    }
    return (
      <Pressable
        key={cell.id}
        accessibilityRole="button"
        accessibilityLabel={cell.label}
        accessibilityHint={`${MATRIX_CELL_STATE_CODE[cellState]}: ${stateLabel}`}
        className="min-h-[44px] w-full flex-row flex-nowrap items-center gap-1.5 rounded-md border px-2.5 py-2.5"
        style={{
          minHeight: 44,
          backgroundColor: palette.background,
          borderColor: palette.border,
          borderWidth: cellState === 'running' && !isEstop ? 2 : 1,
        }}
        disabled={cell.isMotion && !youHold}
        onPressIn={() => {
          if (cell.isMotion && !youHold) return;
          void pressCell(cell);
        }}
        onPressOut={() => {
          void releaseCell(cell);
        }}
      >
        <Text
          numberOfLines={1}
          className="shrink font-semibold"
          style={{ color: palette.foreground, fontSize: 14, flexGrow: 1 }}
        >
          {cell.label}
        </Text>
        <Text
          numberOfLines={1}
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
          style={{
            color: palette.foreground,
            backgroundColor: palette.chip,
          }}
        >
          {MATRIX_CELL_STATE_CODE[cellState]}
        </Text>
        {metaParts.length ? (
          <Text
            numberOfLines={1}
            className="shrink text-[10px] opacity-80"
            style={{ color: metaColor, maxWidth: 88 }}
          >
            {metaParts.join(' · ')}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  /** Prefer showing all motion cells; plant fills leftover space. */
  const plantMinHeight = windowWidth >= 768 ? 140 : 110;

  return (
    <View className="flex-1 bg-background" style={{ minHeight: 0 }}>
      <View className="shrink-0 gap-1.5 px-2 pt-2">
        <HelpTip id="tour.operator.banner">
          <View className="flex-row flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5">
            <Text className="text-sm text-foreground">
              {t('safety')}: <Text className="font-semibold">{safetyMode}</Text>
            </Text>
            <View className="rounded-full border border-border bg-muted px-2 py-0.5">
              <Text className="text-[10px] font-medium text-foreground">
                {youHold
                  ? t('controlYou')
                  : controlHeldByOther
                    ? `${t('controlHeldBy')} ${control?.holderDisplayName || control?.holderUserId}`
                    : t('controlFree')}
              </Text>
            </View>
            {safety.deadmanActive || holdingId ? (
              <View className="rounded-full border border-border bg-muted px-2 py-0.5">
                <Text className="text-[10px] font-medium text-foreground">
                  {t('deadmanHold')}
                </Text>
              </View>
            ) : null}
            {safety.eStopActive ? (
              <View className="rounded-full border border-destructive bg-destructive/20 px-2 py-0.5">
                <Text className="text-[10px] font-bold text-destructive">
                  {t('estop')}
                </Text>
              </View>
            ) : null}
            {youHold ? (
              <Pressable
                accessibilityRole="button"
                className="min-h-[32px] rounded-md px-2 py-1"
                onPress={() => void releaseControl()}
              >
                <Text className="text-xs text-foreground">
                  {t('releaseControl')}
                </Text>
              </Pressable>
            ) : controlHeldByOther ? (
              <Pressable
                accessibilityRole="button"
                className="min-h-[32px] rounded-md border border-border bg-card px-2 py-1"
                onPress={() => void stealControl()}
              >
                <Text className="text-xs text-foreground">
                  {t('stealControl')}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                className="min-h-[32px] rounded-md border border-border bg-card px-2 py-1"
                onPress={() => void claimControl()}
              >
                <Text className="text-xs text-foreground">
                  {t('claimControl')}
                </Text>
              </Pressable>
            )}
          </View>
        </HelpTip>
        {controlHeldByOther ? (
          <Text className="text-[11px] text-muted-foreground">
            {t('stealControlHint')}
          </Text>
        ) : null}
      </View>

      <View className="min-h-0 flex-1 gap-1.5 px-2 pb-1 pt-1.5">
        {screens.length > 1 ? (
          <View className="shrink-0 flex-row flex-wrap gap-1.5">
            {screens.map((screen) => (
              <Pressable
                key={screen.id}
                accessibilityRole="button"
                className={`min-h-[36px] rounded-md border px-3 py-1.5 ${
                  screen.active
                    ? 'border-primary bg-primary'
                    : 'border-border bg-card'
                }`}
                onPress={() => void switchScreen(screen.id)}
              >
                <Text
                  className={`text-sm ${
                    screen.active
                      ? 'text-primary-foreground'
                      : 'text-foreground'
                  }`}
                >
                  {screen.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <HelpTip id="tour.operator.graphic" className="min-h-0 flex-1">
          <View
            className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10"
            style={{
              flex: 1,
              minHeight: plantMinHeight,
              backgroundColor: solidBackground || '#07090c',
            }}
          >
            {useCustomGraphic ? (
              <Image
                source={{ uri: imageUrl }}
                className="absolute inset-0 h-full w-full"
                style={{ opacity: 1, resizeMode: 'contain' }}
                onError={() => setPhotoOk(false)}
              />
            ) : (
              <View
                className="absolute inset-0"
                style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
              />
            )}
            <View className="z-10 flex-row items-center justify-between px-3.5 pb-1 pt-2.5">
              <Text
                className="flex-1 text-[10px] font-medium uppercase text-white/70"
                style={{ letterSpacing: 2.8 }}
                numberOfLines={1}
              >
                {layoutQuery.data?.background?.name ?? t('plantGraphic')}
              </Text>
              <View className="ml-2 flex-row items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5">
                <View
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      tone === 'danger'
                        ? '#fb7185'
                        : tone === 'warn'
                          ? '#fcd34d'
                          : '#8fd0c0',
                  }}
                />
                <Text
                  className="text-[10px] font-medium uppercase text-white/85"
                  style={{ letterSpacing: 1.6 }}
                >
                  {safetyMode}
                </Text>
              </View>
            </View>
            {!useCustomGraphic ? (
              <View className="absolute inset-x-0 bottom-14 top-9 z-[8] px-1">
                <CraneMimic tags={tags} safety={safety} />
              </View>
            ) : null}
            <View
              className="absolute inset-x-0 bottom-14 top-9 z-[10]"
              pointerEvents="none"
            >
              {(layoutQuery.data?.overlays ?? [])
                .filter((o) => !isClusterMetricRegister(o.register?.name))
                .map((o) => (
                  <View
                    key={o.id}
                    className="absolute min-w-[4.5rem] items-center rounded-lg border border-white/18 bg-black/70 px-2.5 py-1.5"
                    style={{
                      left: `${o.xPct}%`,
                      top: `${o.yPct}%`,
                      transform: [{ translateX: -36 }, { translateY: -18 }],
                    }}
                  >
                    <Text className="text-[9px] uppercase text-white/55">
                      {o.label}
                    </Text>
                    <Text className="font-mono text-sm font-semibold text-white">
                      {formatOverlay(
                        o.format,
                        tagValueForRegister(tags, o.register?.name),
                      )}
                    </Text>
                  </View>
                ))}
            </View>
            <View className="absolute inset-x-0 bottom-0 z-10 flex-row border-t border-white/10 bg-[#07090c]/95 px-1 pb-1 pt-1">
              {(
                [
                  {
                    label: 'Height',
                    value: String(height ?? tags?.hoistHeightMm ?? '—'),
                    unit: 'mm',
                  },
                  {
                    label: 'Trolley',
                    value: String(
                      tags?.trolleyPositionMm ??
                        tagValueForRegister(tags, 'holding.trolleyPosition'),
                    ),
                    unit: 'mm',
                  },
                  {
                    label: 'Load',
                    value: String(tags?.loadKg ?? '—'),
                    unit: 'kg',
                  },
                  {
                    label: 'Motor',
                    value: tags?.motorRunning ? 'RUN' : 'IDLE',
                    unit: 'status',
                  },
                ] as const
              ).map((metric, index) => (
                <View
                  key={metric.label}
                  className={`flex-1 items-center gap-0.5 px-1 py-1 ${
                    index > 0 ? 'border-l border-white/10' : ''
                  }`}
                >
                  <Text
                    className="text-[9px] font-medium uppercase text-white/45"
                    style={{ letterSpacing: 2 }}
                  >
                    {metric.label}
                  </Text>
                  <Text className="font-mono text-base font-semibold text-white">
                    {metric.value}
                  </Text>
                  <Text
                    className="text-[10px] uppercase text-white/40"
                    style={{ letterSpacing: 1.2 }}
                  >
                    {metric.unit}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </HelpTip>

        <Card compact className="shrink-0">
          <HelpTip id="tour.operator.safePin">
            <View className="gap-1">
              <View className="flex-row items-center gap-1.5">
                <TextInput
                  className="h-9 min-h-9 flex-1 rounded-md border border-border bg-input px-2.5 text-xs text-foreground"
                  value={pin}
                  onChangeText={setPin}
                  secureTextEntry
                  autoCapitalize="none"
                  placeholder={t('safePin')}
                  placeholderTextColor="#5C6B7A"
                  accessibilityLabel={t('safePin')}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('resetEstop')}
                  className="h-9 min-h-9 shrink-0 items-center justify-center rounded-md border border-border px-2.5"
                  onPress={() => void resetEStop()}
                >
                  <Text className="text-[11px] font-semibold text-foreground">
                    {t('resetEstop')}
                  </Text>
                </Pressable>
              </View>
              {showJogSpeed ? (
                <View
                  className="flex-row flex-wrap items-center gap-1.5"
                  accessibilityLabel={t('jogSpeed')}
                >
                  <Text className="text-[11px] text-muted-foreground">
                    {t('jogSpeed')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: jogSpeed === 'slow' }}
                    className="h-8 min-h-8 items-center justify-center rounded-md border px-2.5"
                    style={{
                      borderColor: jogSpeed === 'slow' ? '#3D9CFD' : '#5C6B7A',
                      backgroundColor:
                        jogSpeed === 'slow'
                          ? 'rgba(61,156,253,0.2)'
                          : 'transparent',
                    }}
                    onPress={() => setJogSpeed('slow')}
                  >
                    <Text className="text-[11px] font-semibold text-foreground">
                      {t('jogSlow')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: jogSpeed === 'fast' }}
                    className="h-8 min-h-8 items-center justify-center rounded-md border px-2.5"
                    style={{
                      borderColor: jogSpeed === 'fast' ? '#3D9CFD' : '#5C6B7A',
                      backgroundColor:
                        jogSpeed === 'fast'
                          ? 'rgba(61,156,253,0.2)'
                          : 'transparent',
                    }}
                    onPress={() => setJogSpeed('fast')}
                  >
                    <Text className="text-[11px] font-semibold text-foreground">
                      {t('jogFast')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </HelpTip>
          <HelpTip id="tour.operator.holdHint">
            <HelpTip id="tour.operator.matrix">
              <View
                className={
                  matrixCols > 1 ? 'mt-1 flex-row flex-wrap' : 'mt-1 gap-1.5'
                }
                style={matrixCols > 1 ? { gap: matrixGap } : undefined}
              >
                {grid &&
                  grid.cells.map((cell, idx) => {
                    if (!cell) {
                      return matrixCols > 1 ? (
                        <View
                          key={`empty-${idx}`}
                          style={{ width: matrixCellWidth, height: 44 }}
                          accessibilityElementsHidden
                        />
                      ) : null;
                    }
                    if (
                      stopCell &&
                      (cell.id === stopCell.id || cell.style === 'estop')
                    ) {
                      return null;
                    }
                    return (
                      <View
                        key={cell.id}
                        style={
                          matrixCols > 1
                            ? { width: matrixCellWidth }
                            : { width: '100%' }
                        }
                      >
                        {renderMobileCell(cell)}
                      </View>
                    );
                  })}
              </View>
            </HelpTip>
          </HelpTip>
        </Card>
      </View>

      {stopCell ? (
        <View
          className="border-t border-border bg-background px-2 pt-2"
          style={{ paddingBottom: 12 }}
          accessibilityLabel="Stop dock"
        >
          {renderMobileCell(stopCell)}
        </View>
      ) : null}
    </View>
  );
}
