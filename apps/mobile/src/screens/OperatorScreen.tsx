import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ComponentProps,
  MutableRefObject,
  ReactNode,
  RefObject,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useQuery } from '@tanstack/react-query';
import {
  cellPulsesDeadman,
  cellRequiresControlLease,
  cellUsesHoldToRun,
  formatOverlay,
  isClusterMetricRegister,
  isOperatorScreenReady,
  MATRIX_CELL_STATE_CODE,
  MATRIX_CELL_STATE_I18N,
  operatorNeedsLiveTags,
  parseSelectorSideLabels,
  resolveMatrixCellUiState,
  nextLiveTagsCursor,
  shouldApplyLiveTags,
  tagValueForRegister,
  type TagSnapshot,
} from '@tele-pendant/shared';
import { io, Socket } from 'socket.io-client';
import { operatorApiError } from '../api-errors';
import { apiGet, apiPost, getApiBase } from '../api';
import { getControlClientId } from '../control-client-id';
import { useControlLease } from '../control-lease';
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
import { Card, showErrorAlert } from '../ui';
import { syncFingers, touchesStillDown, type Finger } from '../multi-touch';

type SafetySnap = {
  mode: string;
  eStopActive?: boolean;
  deadmanActive?: boolean;
  watchdogOk?: boolean;
  control?: ControlLease;
};

type Hold = {
  cellId: string;
  direction: 'a' | 'b' | null;
  gen: number;
};

function holdKey(cellId: string, direction?: 'a' | 'b' | null): string {
  return direction ? `${cellId}:${direction}` : cellId;
}

function cellIsHeld(
  holds: Map<string, Hold>,
  cellId: string,
  direction?: 'a' | 'b',
): boolean {
  if (direction) return holds.has(holdKey(cellId, direction));
  for (const key of holds.keys()) {
    if (key === cellId || key.startsWith(`${cellId}:`)) return true;
  }
  return false;
}

type TargetBox = {
  cell: Cell;
  direction?: 'a' | 'b';
  x: number;
  y: number;
  width: number;
  height: number;
};

type Measurable = {
  measureLayout: (
    relativeToNativeNode: Measurable,
    onSuccess: (x: number, y: number, width: number, height: number) => void,
    onFail: () => void,
  ) => void;
};

function TouchTarget({
  targetKey,
  cell,
  direction,
  boardRef,
  targets,
  accessibilityLabel,
  className,
  style,
  children,
}: {
  targetKey: string;
  cell: Cell;
  direction?: 'a' | 'b';
  boardRef: RefObject<Measurable | null>;
  targets: MutableRefObject<Map<string, TargetBox>>;
  accessibilityLabel: string;
  className?: string;
  style?: ComponentProps<typeof View>['style'];
  children: ReactNode;
}) {
  const ref = useRef<Measurable | null>(null);
  const measure = () => {
    const node = ref.current;
    const board = boardRef.current;
    if (!node || !board) return;
    node.measureLayout(
      board,
      (x, y, width, height) => {
        targets.current.set(targetKey, {
          cell,
          direction,
          x,
          y,
          width,
          height,
        });
      },
      () => undefined,
    );
  };
  useEffect(
    () => () => {
      targets.current.delete(targetKey);
    },
    [targetKey, targets],
  );
  return (
    <View
      ref={ref as never}
      onLayout={measure}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={className}
      style={style}
    >
      {children}
    </View>
  );
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
  const { control, youHold, applyControl } = useControlLease();
  const controlRef = useRef(control);
  const [pin, setPin] = useState('');
  const holdsRef = useRef(new Map<string, Hold>());
  const [heldVersion, setHeldVersion] = useState(0);
  const bumpHolds = useCallback(() => {
    setHeldVersion((version) => version + 1);
  }, []);
  const [jogSpeed, setJogSpeed] = useState<'slow' | 'fast'>('fast');
  const jogSpeedRef = useRef<'slow' | 'fast'>('fast');
  const [safety, setSafety] = useState<SafetySnap>({ mode: 'unknown' });
  const [height, setHeight] = useState<number | null>(null);
  const [tags, setTags] = useState<TagSnapshot | null>(null);

  useEffect(() => {
    controlRef.current = control;
  }, [control]);

  useEffect(() => {
    jogSpeedRef.current = jogSpeed;
  }, [jogSpeed]);

  const [photoOk, setPhotoOk] = useState(true);
  const [liveFallback, setLiveFallback] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const inflight = useRef(new Set<string>());
  const releaseWaiting = useRef(new Map<string, 'a' | 'b' | null>());
  const fingers = useRef(new Map<number, Finger>());
  const targets = useRef(
    new Map<
      string,
      {
        cell: Cell;
        direction?: 'a' | 'b';
        x: number;
        y: number;
        width: number;
        height: number;
      }
    >(),
  );
  const boardRef = useRef<Measurable | null>(null);
  const tagOrderRef = useRef<{ lastSeq: number; lastAt: string | null }>({
    lastSeq: 0,
    lastAt: null,
  });
  const tagsPullInFlight = useRef(false);
  const lastWsTagAt = useRef(0);

  const applyLiveTags = useCallback(
    (payload: TagSnapshot & { at?: string }) => {
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
    },
    [],
  );

  useEffect(() => {
    let socket: Socket | null = null;
    let closed = false;
    const base = getApiBase();
    const origin = base.replace(/\/api\/v1$/, '');
    void getControlClientId().then((controlClientId) => {
      if (closed) return;
      socket = io(`${origin}/realtime`, {
        transports: ['websocket', 'polling'],
        path: '/socket.io',
        reconnection: true,
        reconnectionAttempts: Infinity,
        auth: token ? { token, controlClientId } : { controlClientId },
      });
      socketRef.current = socket;
      socket.on('safety.state', (s: SafetySnap) => {
        setSafety(s);
        if (s.control) applyControl(s.control);
      });
      socket.on('tags.update', (payload: TagSnapshot) => {
        lastWsTagAt.current = Date.now();
        applyLiveTags(payload);
      });
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
    async (cellId: string, direction?: 'a' | 'b' | null) => {
      try {
        await apiPost(
          `/hmi/cells/${cellId}/activate`,
          {
            value: false,
            speed: jogSpeedRef.current,
            ...(direction ? { direction } : {}),
          },
          token,
        );
      } catch {
        // Best-effort coil drop.
      }
    },
    [token],
  );

  const leaseStillHeld = useCallback(
    (exceptKey?: string) => {
      for (const [key, hold] of holdsRef.current) {
        if (key === exceptKey) continue;
        const cell = layoutQuery.data?.cells.find(
          (row) => row.id === hold.cellId,
        );
        if (cell && cellPulsesDeadman(cell)) return true;
      }
      return false;
    },
    [layoutQuery.data?.cells],
  );

  const finishMotionRelease = useCallback(
    (key: string, cellId: string, direction?: 'a' | 'b' | null) => {
      releaseWaiting.current.delete(key);
      if (!leaseStillHeld()) releaseDeadman();
      void dropMotionCoil(cellId, direction);
    },
    [dropMotionCoil, leaseStillHeld, releaseDeadman],
  );

  // Pulse deadman while any jog is held. Enable can stay down beside it.
  useEffect(() => {
    void heldVersion;
    const needsPulse = [...holdsRef.current.values()].some((hold) => {
      const cell = layoutQuery.data?.cells.find(
        (row) => row.id === hold.cellId,
      );
      return Boolean(cell && cellPulsesDeadman(cell));
    });
    if (!needsPulse) return;
    const pulse = () => {
      socketRef.current?.emit('deadman.pulse');
    };
    pulse();
    const id = setInterval(pulse, 400);
    return () => clearInterval(id);
  }, [heldVersion, layoutQuery.data?.cells]);

  const pressCell = async (cell: Cell, direction?: 'a' | 'b') => {
    const key = holdKey(cell.id, direction);
    const pressGen = holdsRef.current.get(key)?.gen ?? 0;
    const needsLease = cellRequiresControlLease(cell);
    const holdToRun = cellUsesHoldToRun(cell);
    if (needsLease && !controlRef.current?.youHold) {
      showErrorAlert(
        controlRef.current?.held
          ? `${t('controlHeldBy')} ${controlRef.current.holderDisplayName || controlRef.current.holderUserId}`
          : t('err.control'),
      );
      void hapticMotionBlocked();
      return;
    }
    if (holdToRun) {
      holdsRef.current.set(key, {
        cellId: cell.id,
        direction: direction ?? null,
        gen: pressGen,
      });
      releaseWaiting.current.delete(key);
      bumpHolds();
      void hapticHoldStart();
    }
    inflight.current.add(key);
    const speed =
      cell.isMotion && (cell.variableSpeed ?? true)
        ? jogSpeedRef.current
        : undefined;
    try {
      if (cellPulsesDeadman(cell)) {
        await pulseDeadman();
      }
      await apiPost(
        `/hmi/cells/${cell.id}/activate`,
        {
          value: true,
          ...(speed ? { speed } : {}),
          ...(direction ? { direction } : {}),
        },
        token,
      );
    } catch (err) {
      if (needsLease && isMotionBlockedError(err)) {
        void hapticMotionBlocked();
      }
      showErrorAlert(
        operatorApiError(
          err,
          cell.style === 'estop' ? 'stop' : 'reset',
          terror,
        ),
      );
      const held = holdsRef.current.get(key);
      if (held && held.gen === pressGen) {
        holdsRef.current.delete(key);
        bumpHolds();
        if (cellPulsesDeadman(cell) && !leaseStillHeld()) releaseDeadman();
      }
      releaseWaiting.current.delete(key);
      return;
    } finally {
      inflight.current.delete(key);
    }
    if (holdToRun && releaseWaiting.current.has(key)) {
      const waitingDirection = releaseWaiting.current.get(key);
      finishMotionRelease(key, cell.id, waitingDirection);
      return;
    }
    const held = holdsRef.current.get(key);
    if (holdToRun && (!held || held.gen !== pressGen)) {
      void dropMotionCoil(cell.id, direction);
      if (!leaseStillHeld()) releaseDeadman();
    }
  };

  const releaseCell = (cell: Cell, direction?: 'a' | 'b') => {
    if (!cellUsesHoldToRun(cell)) return;
    const key = holdKey(cell.id, direction);
    const held = holdsRef.current.get(key);
    if (!held) return;
    holdsRef.current.delete(key);
    bumpHolds();
    if (cell.style === 'enable') {
      for (const [otherKey, hold] of [...holdsRef.current.entries()]) {
        const other = layoutQuery.data?.cells.find(
          (row) => row.id === hold.cellId,
        );
        if (!other || !cellPulsesDeadman(other)) continue;
        holdsRef.current.delete(otherKey);
        if (inflight.current.has(otherKey)) {
          releaseWaiting.current.set(otherKey, hold.direction);
          continue;
        }
        finishMotionRelease(otherKey, other.id, hold.direction);
      }
    }
    if (inflight.current.has(key)) {
      releaseWaiting.current.set(key, direction ?? held.direction);
      return;
    }
    finishMotionRelease(key, cell.id, direction ?? held.direction);
  };

  const clearSelector = async (cell: Cell) => {
    try {
      await apiPost(`/hmi/cells/${cell.id}/activate`, { value: false }, token);
    } catch {
      // Best-effort center clear.
    }
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        const held = [...holdsRef.current.values()];
        holdsRef.current.clear();
        releaseWaiting.current.clear();
        fingers.current.clear();
        bumpHolds();
        releaseDeadman();
        for (const hold of held) {
          const cell = layoutQuery.data?.cells.find(
            (row) => row.id === hold.cellId,
          );
          if (!cell || !cellUsesHoldToRun(cell)) continue;
          void apiPost(
            `/hmi/cells/${hold.cellId}/activate`,
            {
              value: false,
              ...(hold.direction ? { direction: hold.direction } : {}),
            },
            token,
          );
        }
      }
    });
    return () => sub.remove();
  }, [bumpHolds, layoutQuery.data?.cells, releaseDeadman, token]);

  const resetEStop = async () => {
    try {
      await apiPost('/safety/reset', { pin }, token);
    } catch (err) {
      showErrorAlert(operatorApiError(err, 'reset', terror));
    }
  };

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

  const isPendantScreen = (layoutQuery.data?.background?.name ?? '').includes(
    'p03a21',
  );
  const isP03a21 =
    isPendantScreen ||
    Boolean(layoutQuery.data?.cells.some((c) => c.style === 'selector'));

  const grid = useMemo(() => {
    const layout = layoutQuery.data;
    if (!layout) return null;
    const map = new Map(layout.cells.map((c) => [`${c.row}:${c.col}`, c]));
    const rows: Array<Array<Cell | null>> = [];
    for (let r = 0; r < layout.matrix.rows; r++) {
      const row: Array<Cell | null> = [];
      for (let c = 0; c < layout.matrix.cols; c++) {
        row.push(map.get(`${r}:${c}`) ?? null);
      }
      rows.push(row);
    }
    return { cols: layout.matrix.cols, rows };
  }, [layoutQuery.data]);

  const showJogSpeed = useMemo(
    () =>
      !isP03a21 &&
      Boolean(
        layoutQuery.data?.cells.some(
          (cell) => cell.isMotion && (cell.variableSpeed ?? true),
        ),
      ),
    [isP03a21, layoutQuery.data?.cells],
  );

  /** Pendant: keep 3-col layout on phones; otherwise 1 col until tablet. */
  const matrixCols =
    isP03a21 || windowWidth >= 768 ? Math.max(1, grid?.cols ?? 1) : 1;
  const matrixGap = isP03a21 ? 6 : 8;

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
    gridReady: Boolean(grid?.rows.length),
    needsLive,
    hasTags: tags !== null,
    liveFallback,
  });

  const pressCellRef = useRef(pressCell);
  const releaseCellRef = useRef(releaseCell);
  pressCellRef.current = pressCell;
  releaseCellRef.current = releaseCell;

  const applyTouches = useCallback(
    (
      touches: { id: number; x: number; y: number }[],
      lifted: { id: number; x: number; y: number }[] = [],
    ) => {
      const { press, release } = syncFingers(
        fingers.current,
        touchesStillDown(touches, lifted),
        (x, y) => {
          for (const [key, target] of targets.current) {
            if (
              x >= target.x &&
              y >= target.y &&
              x <= target.x + target.width &&
              y <= target.y + target.height
            ) {
              return key;
            }
          }
          return null;
        },
      );
      for (const key of release) {
        const target = targets.current.get(key);
        if (target) releaseCellRef.current(target.cell, target.direction);
      }
      for (const key of press) {
        const target = targets.current.get(key);
        if (target) void pressCellRef.current(target.cell, target.direction);
      }
    },
    [],
  );

  const matrixGesture = useMemo(
    () =>
      Gesture.Manual()
        .runOnJS(true)
        .onTouchesDown((event) => {
          applyTouches(event.allTouches);
        })
        .onTouchesMove((event) => {
          applyTouches(event.allTouches);
        })
        .onTouchesUp((event) => {
          applyTouches(event.allTouches, event.changedTouches);
        })
        .onTouchesCancelled((event) => {
          applyTouches(event.allTouches, event.changedTouches);
        }),
    [applyTouches],
  );

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

  const compactButtons = windowWidth < 768;

  const renderMobileCell = (cell: Cell, multi = false) => {
    const isEstop = cell.style === 'estop';
    const needsLease = cellRequiresControlLease(cell);
    const holdToRun = cellUsesHoldToRun(cell);
    const cellState = resolveMatrixCellUiState({
      style: cell.style,
      isMotion: cell.isMotion,
      isHolding: cellIsHeld(holdsRef.current, cell.id),
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
    const estopLatched =
      isEstop &&
      (Boolean(safety.eStopActive) ||
        (safety.mode ?? '').toLowerCase() === 'e_stop');
    const stateLabel = estopLatched
      ? t('estop')
      : t(MATRIX_CELL_STATE_I18N[cellState]);
    const stateCode = estopLatched ? 'STOP' : MATRIX_CELL_STATE_CODE[cellState];
    const isLamp = cell.style === 'lamp';
    const lampRegisterName = isLamp
      ? cell.primaryRegister?.name
      : cell.feedbackRegister?.name;
    const feedbackRaw = lampRegisterName
      ? tagValueForRegister(tags, lampRegisterName)
      : undefined;
    const feedbackIsBool =
      typeof feedbackRaw === 'boolean' ||
      feedbackRaw === 0 ||
      feedbackRaw === 1;
    const lampOn = Boolean(feedbackRaw);
    const statusTrailing = (
      <View className="shrink-0 flex-row items-center gap-1">
        {(isLamp || cell.feedbackRegister) && feedbackIsBool ? (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              backgroundColor: lampOn ? '#34d399' : 'rgba(148,163,184,0.45)',
            }}
            accessibilityElementsHidden
          />
        ) : null}
        {cell.feedbackRegister && !feedbackIsBool ? (
          <Text
            numberOfLines={1}
            className="text-[9px] opacity-80"
            style={{ color: palette.foreground, maxWidth: 56 }}
          >
            F {String(feedbackRaw)}
          </Text>
        ) : null}
        {cell.statusRegister ? (
          <Text
            numberOfLines={1}
            className="text-[9px] opacity-80"
            style={{ color: palette.foreground, maxWidth: 48 }}
          >
            S {String(tagValueForRegister(tags, cell.statusRegister.name))}
          </Text>
        ) : null}
        <Text
          numberOfLines={1}
          className={`rounded font-bold uppercase ${
            compactButtons
              ? 'px-[2.5px] py-[1.25px] text-[5.6px]'
              : 'px-1 py-0.5 text-[9px]'
          }`}
          style={{
            color: palette.foreground,
            backgroundColor: palette.chip,
          }}
        >
          {stateCode}
        </Text>
      </View>
    );

    if (isP03a21 && !isEstop) {
      const legend = (
        <Text
          numberOfLines={4}
          style={{
            width: '100%',
            textAlign: 'center',
            color: '#1c1917',
            fontSize: 12,
            lineHeight: 15,
            fontWeight: '600',
          }}
        >
          {cell.label}
        </Text>
      );
      if (isLamp) {
        return (
          <View key={cell.id} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View
              accessibilityRole="text"
              accessibilityLabel={`${cell.label}: ${lampOn ? 'on' : 'off'}`}
              style={{
                width: 72,
                height: 72,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#a8a29e',
                backgroundColor: lampOn ? '#d1fae5' : '#e7e5e4',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  backgroundColor: lampOn
                    ? '#10b981'
                    : 'rgba(148,163,184,0.45)',
                }}
              />
            </View>
            {legend}
          </View>
        );
      }
      const lamp =
        cell.feedbackRegister && feedbackIsBool ? (
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              backgroundColor: lampOn ? '#34d399' : 'rgba(148,163,184,0.55)',
            }}
            accessibilityElementsHidden
          />
        ) : null;
      if (cell.style === 'selector') {
        const { sideA, sideB } = parseSelectorSideLabels(cell.label);
        const aActive =
          cellIsHeld(holdsRef.current, cell.id, 'a') ||
          Boolean(tagValueForRegister(tags, cell.primaryRegister?.name));
        const bActive =
          cellIsHeld(holdsRef.current, cell.id, 'b') ||
          Boolean(tagValueForRegister(tags, cell.secondaryRegister?.name));
        const latch = !holdToRun;
        return (
          <View key={cell.id} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                overflow: 'hidden',
                flexDirection: 'row',
                backgroundColor: '#1c1c1c',
                borderWidth: 2,
                borderColor: '#3a3a3a',
              }}
            >
              {(['a', 'b'] as const).map((dir) => {
                const caption = dir === 'a' ? sideA : sideB;
                const active = dir === 'a' ? aActive : bActive;
                const sideStyle = {
                  flex: 1,
                  height: 72,
                  alignItems: 'center' as const,
                  justifyContent: 'center' as const,
                  backgroundColor: active ? '#3D9CFD' : 'transparent',
                  paddingHorizontal: 1,
                };
                const sideLabel = (
                  <Text
                    numberOfLines={2}
                    style={{
                      color: '#f4f4f5',
                      fontSize: 9,
                      lineHeight: 11,
                      fontWeight: '700',
                      textAlign: 'center',
                    }}
                  >
                    {caption}
                  </Text>
                );
                return multi ? (
                  <TouchTarget
                    key={dir}
                    targetKey={holdKey(cell.id, dir)}
                    cell={cell}
                    direction={dir}
                    boardRef={boardRef}
                    targets={targets}
                    accessibilityLabel={`${cell.label} ${caption}`}
                    style={sideStyle}
                  >
                    {sideLabel}
                  </TouchTarget>
                ) : (
                  <Pressable
                    key={dir}
                    accessibilityRole="button"
                    accessibilityLabel={`${cell.label} ${caption}`}
                    accessibilityState={{ disabled: needsLease && !youHold }}
                    disabled={needsLease && !youHold}
                    style={sideStyle}
                    onPressIn={() => {
                      if (needsLease && !youHold) return;
                      void pressCell(cell, dir);
                    }}
                    onPressOut={() => {
                      void releaseCell(cell, dir);
                    }}
                  >
                    {sideLabel}
                  </Pressable>
                );
              })}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 8,
                  bottom: 8,
                  width: 1,
                  marginLeft: -0.5,
                  backgroundColor: '#6b6b6b',
                }}
              />
              {lamp ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: 10,
                    height: 10,
                    marginLeft: -5,
                    marginTop: -5,
                    borderRadius: 999,
                    backgroundColor: lampOn
                      ? '#34d399'
                      : 'rgba(244,244,245,0.45)',
                  }}
                />
              ) : null}
              {latch ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${cell.label} center`}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: 0,
                    width: 16,
                    height: 72,
                    marginLeft: -8,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onPress={() => void clearSelector(cell)}
                >
                  <Text style={{ color: '#f4f4f5', fontSize: 12 }}>·</Text>
                </Pressable>
              ) : null}
            </View>
            {legend}
          </View>
        );
      }
      const capStyle = {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        backgroundColor: '#fbfbf8',
        borderWidth: 2,
        borderColor: '#8d8d8d',
      };
      const cap = multi ? (
        <TouchTarget
          targetKey={holdKey(cell.id)}
          cell={cell}
          boardRef={boardRef}
          targets={targets}
          accessibilityLabel={cell.label}
          style={capStyle}
        >
          {lamp}
        </TouchTarget>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cell.label}
          disabled={needsLease && !youHold}
          style={capStyle}
          onPressIn={() => {
            if (needsLease && !youHold) return;
            void pressCell(cell);
          }}
          onPressOut={() => {
            void releaseCell(cell);
          }}
        >
          {lamp}
        </Pressable>
      );
      return (
        <View key={cell.id} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          {cap}
          {legend}
        </View>
      );
    }

    if (cell.style === 'selector') {
      const { sideA, sideB } = parseSelectorSideLabels(cell.label);
      const latch = !holdToRun;
      const aActive =
        cellIsHeld(holdsRef.current, cell.id, 'a') ||
        Boolean(tagValueForRegister(tags, cell.primaryRegister?.name));
      const bActive =
        cellIsHeld(holdsRef.current, cell.id, 'b') ||
        Boolean(tagValueForRegister(tags, cell.secondaryRegister?.name));
      return (
        <View
          key={cell.id}
          className={`w-full rounded-md border ${
            compactButtons
              ? 'gap-[1.25px] px-[3.75px] py-[2.5px]'
              : 'gap-0.5 px-1.5 py-1'
          }`}
          style={{
            borderColor: palette.border,
            backgroundColor: palette.background,
            minHeight: 56,
            flex: 1,
          }}
        >
          <View className="flex-row items-center gap-1">
            <Text
              numberOfLines={3}
              className="shrink font-semibold"
              style={{
                color: palette.foreground,
                fontSize: compactButtons
                  ? isP03a21
                    ? 6.9
                    : 8.1
                  : isP03a21
                    ? 11
                    : 13,
                flexGrow: 1,
                flexShrink: 1,
                lineHeight: compactButtons
                  ? isP03a21
                    ? 8.8
                    : 10
                  : isP03a21
                    ? 14
                    : 16,
              }}
            >
              {cell.label}
            </Text>
            {statusTrailing}
          </View>
          <View className="flex-row gap-0.5">
            {(['a', 'b'] as const).map((dir) => {
              const caption = dir === 'a' ? sideA : sideB;
              const active = dir === 'a' ? aActive : bActive;
              return multi ? (
                <TouchTarget
                  key={dir}
                  targetKey={holdKey(cell.id, dir)}
                  cell={cell}
                  direction={dir}
                  boardRef={boardRef}
                  targets={targets}
                  accessibilityLabel={`${cell.label} ${caption}`}
                  className={`flex-1 items-center justify-center rounded-md border ${
                    compactButtons ? 'px-[2.5px]' : 'px-1'
                  }`}
                  style={{
                    minHeight: 36,
                    borderColor: palette.border,
                    backgroundColor: active ? palette.chip : 'transparent',
                    opacity: needsLease && !youHold ? 0.5 : 1,
                  }}
                >
                  <Text
                    className="font-bold uppercase"
                    numberOfLines={1}
                    style={{
                      color: palette.foreground,
                      fontSize: compactButtons
                        ? isP03a21
                          ? 6.3
                          : 7.5
                        : isP03a21
                          ? 10
                          : 12,
                    }}
                  >
                    {caption}
                  </Text>
                </TouchTarget>
              ) : (
                <Pressable
                  key={dir}
                  accessibilityRole="button"
                  accessibilityLabel={`${cell.label} ${caption}`}
                  accessibilityState={{ disabled: needsLease && !youHold }}
                  className={`flex-1 items-center justify-center rounded-md border ${
                    compactButtons ? 'px-[2.5px]' : 'px-1'
                  }`}
                  style={{
                    minHeight: 36,
                    borderColor: palette.border,
                    backgroundColor: active ? palette.chip : 'transparent',
                    opacity: needsLease && !youHold ? 0.5 : 1,
                  }}
                  disabled={needsLease && !youHold}
                  onPressIn={() => {
                    if (needsLease && !youHold) return;
                    void pressCell(cell, dir);
                  }}
                  onPressOut={() => {
                    void releaseCell(cell, dir);
                  }}
                >
                  <Text
                    className="font-bold uppercase"
                    numberOfLines={1}
                    style={{
                      color: palette.foreground,
                      fontSize: compactButtons
                        ? isP03a21
                          ? 6.3
                          : 7.5
                        : isP03a21
                          ? 10
                          : 12,
                    }}
                  >
                    {caption}
                  </Text>
                </Pressable>
              );
            })}
            {latch ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${cell.label} center`}
                className={`items-center justify-center rounded-md border ${
                  compactButtons ? 'px-[3.75px]' : 'px-1.5'
                }`}
                style={{ minHeight: 36, borderColor: palette.border }}
                onPress={() => void clearSelector(cell)}
              >
                <Text style={{ color: palette.foreground }}>·</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    }

    if (isLamp) {
      return (
        <View
          key={cell.id}
          accessibilityRole="text"
          accessibilityLabel={`${cell.label}: ${lampOn ? 'on' : 'off'}`}
          className={`w-full flex-row items-center rounded-md border ${
            compactButtons
              ? 'gap-[1.25px] px-[3.75px] py-[2.5px]'
              : 'gap-1 px-1.5 py-1'
          }`}
          style={{
            minHeight: 44,
            flex: 1,
            borderColor: palette.border,
            backgroundColor: lampOn ? '#d1fae5' : palette.background,
          }}
        >
          <Text
            numberOfLines={3}
            className="shrink font-semibold"
            style={{
              color: palette.foreground,
              fontSize: compactButtons
                ? isP03a21
                  ? 7.5
                  : 8.8
                : isP03a21
                  ? 12
                  : 14,
              flexGrow: 1,
              flexShrink: 1,
              lineHeight: compactButtons
                ? isP03a21
                  ? 10
                  : 11.3
                : isP03a21
                  ? 15
                  : 18,
            }}
          >
            {cell.label}
          </Text>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              backgroundColor: lampOn ? '#10b981' : 'rgba(148,163,184,0.45)',
            }}
          />
        </View>
      );
    }

    const face = (
      <Text
        numberOfLines={3}
        className="shrink font-semibold"
        style={{
          color: palette.foreground,
          fontSize: compactButtons
            ? isP03a21
              ? 7.5
              : 8.8
            : isP03a21
              ? 12
              : 14,
          flexGrow: 1,
          flexShrink: 1,
          lineHeight: compactButtons
            ? isP03a21
              ? 10
              : 11.3
            : isP03a21
              ? 15
              : 18,
        }}
      >
        {cell.label}
      </Text>
    );
    const faceStyle = {
      minHeight: 44,
      flex: 1,
      backgroundColor: palette.background,
      borderColor: palette.border,
      borderWidth: cellState === 'running' && !isEstop ? 2 : 1,
    } as const;

    if (multi) {
      return (
        <TouchTarget
          key={cell.id}
          targetKey={holdKey(cell.id)}
          cell={cell}
          boardRef={boardRef}
          targets={targets}
          accessibilityLabel={cell.label}
          className={`w-full flex-row items-center rounded-md border ${
            compactButtons
              ? 'gap-[3.75px] px-[5px] py-[3.75px]'
              : 'gap-1 px-2 py-1.5'
          }`}
          style={faceStyle}
        >
          {face}
          {statusTrailing}
        </TouchTarget>
      );
    }

    return (
      <Pressable
        key={cell.id}
        accessibilityRole="button"
        accessibilityLabel={cell.label}
        accessibilityHint={`${stateCode}: ${stateLabel}`}
        className={`w-full flex-row items-center rounded-md border ${
          compactButtons
            ? 'gap-[3.75px] px-[5px] py-[3.75px]'
            : 'gap-1 px-2 py-1.5'
        }`}
        style={faceStyle}
        disabled={needsLease && !youHold}
        onPressIn={() => {
          if (needsLease && !youHold) return;
          void pressCell(cell);
        }}
        onPressOut={() => {
          void releaseCell(cell);
        }}
      >
        {face}
        {statusTrailing}
      </Pressable>
    );
  };

  // Crane mimic/readouts follow the active plant tab, not the shared cells.
  const showCraneMetrics =
    !isPendantScreen &&
    (tags?.hoistHeightMm != null ||
      tags?.values?.['holding.hoistHeightMm'] != null);
  const plantMinHeight = isPendantScreen ? 40 : windowWidth >= 768 ? 140 : 110;

  return (
    <View className="flex-1 bg-background" style={{ minHeight: 0 }}>
      <View className="shrink-0 gap-1.5 px-2 pt-2">
        <HelpTip id="tour.operator.banner">
          <View className="flex-row flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5">
            <Text className="text-sm text-foreground">
              {t('safety')}: <Text className="font-semibold">{safetyMode}</Text>
            </Text>
            {safety.deadmanActive || holdsRef.current.size > 0 ? (
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
          </View>
        </HelpTip>
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

        <HelpTip
          id="tour.operator.graphic"
          className={isPendantScreen ? 'shrink-0' : 'min-h-0 flex-1'}
        >
          <View
            className={`relative overflow-hidden rounded-xl border border-white/10 ${
              isPendantScreen ? 'shrink-0' : 'min-h-0 flex-1'
            }`}
            style={{
              flex: isPendantScreen ? undefined : 1,
              minHeight: plantMinHeight,
              maxHeight: isPendantScreen ? plantMinHeight + 8 : undefined,
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
            <View className="z-10 flex-row items-center justify-between px-2.5 pb-0.5 pt-1.5">
              <Text
                className="flex-1 text-[9px] font-medium uppercase text-white/70"
                style={{ letterSpacing: 1.4 }}
                numberOfLines={1}
              >
                {layoutQuery.data?.background?.name ?? t('plantGraphic')}
              </Text>
              <View className="ml-2 flex-row items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5">
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
                  className="text-[9px] font-medium uppercase text-white/85"
                  style={{ letterSpacing: 1.2 }}
                >
                  {safetyMode}
                </Text>
              </View>
            </View>
            {!useCustomGraphic && showCraneMetrics ? (
              <View className="absolute inset-x-0 bottom-10 top-7 z-[8] px-1">
                <CraneMimic tags={tags} safety={safety} />
              </View>
            ) : null}
            {showCraneMetrics || useCustomGraphic ? (
              <View
                className={`absolute inset-x-0 top-7 z-[10] ${
                  showCraneMetrics ? 'bottom-10' : 'bottom-2'
                }`}
                pointerEvents="none"
              >
                {(layoutQuery.data?.overlays ?? [])
                  .filter((o) => !isClusterMetricRegister(o.register?.name))
                  .map((o) => (
                    <View
                      key={o.id}
                      className="absolute min-w-[3.5rem] items-center rounded-md border border-white/18 bg-black/70 px-1.5 py-0.5"
                      style={{
                        left: `${o.xPct}%`,
                        top: `${o.yPct}%`,
                        transform: [{ translateX: -28 }, { translateY: -12 }],
                      }}
                    >
                      <Text className="text-[8px] uppercase text-white/55">
                        {o.label}
                      </Text>
                      <Text className="font-mono text-xs font-semibold text-white">
                        {formatOverlay(
                          o.format,
                          tagValueForRegister(tags, o.register?.name),
                        )}
                      </Text>
                    </View>
                  ))}
              </View>
            ) : null}
            {showCraneMetrics ? (
              <View className="absolute inset-x-0 bottom-0 z-10 flex-row border-t border-white/10 bg-[#07090c]/95 px-0.5 pb-0.5 pt-0.5">
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
                      value: safety.eStopActive
                        ? 'IDLE'
                        : tags?.motorRunning
                          ? 'RUN'
                          : 'IDLE',
                      unit: 'status',
                    },
                  ] as const
                ).map((metric, index) => (
                  <View
                    key={metric.label}
                    className={`flex-1 items-center px-0.5 py-0.5 ${
                      index > 0 ? 'border-l border-white/10' : ''
                    }`}
                  >
                    <Text
                      className="text-[7px] font-medium uppercase text-white/45"
                      style={{ letterSpacing: 1 }}
                    >
                      {metric.label}
                    </Text>
                    <Text className="font-mono text-sm font-semibold text-white">
                      {metric.value}
                    </Text>
                    <Text
                      className="text-[8px] uppercase text-white/40"
                      style={{ letterSpacing: 0.8 }}
                    >
                      {metric.unit}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </HelpTip>

        <Card compact className="min-h-0 flex-1">
          <HelpTip id="tour.operator.safePin">
            <View className="gap-0.5">
              <View className="flex-row items-center gap-1">
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
              <ScrollView
                className="mt-1 min-h-0 flex-1"
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              >
                <GestureDetector gesture={matrixGesture}>
                  <View
                    ref={boardRef as never}
                    collapsable={false}
                    style={
                      isP03a21
                        ? {
                            alignSelf: 'center',
                            width: '100%',
                            maxWidth: 576,
                            backgroundColor: '#f4f1ea',
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: '#d5d0c6',
                            paddingTop: 12,
                            paddingHorizontal: 8,
                            paddingBottom: 4,
                          }
                        : undefined
                    }
                  >
                    {grid && matrixCols > 1
                      ? grid.rows.map((row, rowIdx) => (
                          <View
                            key={`row-${rowIdx}`}
                            className="flex-row"
                            style={{
                              gap: matrixGap,
                              marginBottom: matrixGap,
                              alignItems: 'stretch',
                            }}
                          >
                            {row.map((cell, colIdx) => {
                              const isStop =
                                Boolean(cell) &&
                                Boolean(stopCell) &&
                                (cell!.id === stopCell!.id ||
                                  cell!.style === 'estop');
                              if (!cell || isStop) {
                                return (
                                  <View
                                    key={`hole-${rowIdx}-${colIdx}`}
                                    style={{ flex: 1, minWidth: 0 }}
                                    accessibilityElementsHidden
                                  />
                                );
                              }
                              return (
                                <View
                                  key={cell.id}
                                  style={{ flex: 1, minWidth: 0 }}
                                >
                                  {renderMobileCell(cell, true)}
                                </View>
                              );
                            })}
                          </View>
                        ))
                      : grid?.rows.flatMap((row) =>
                          row.flatMap((cell) => {
                            if (!cell) return [];
                            if (
                              stopCell &&
                              (cell.id === stopCell.id ||
                                cell.style === 'estop')
                            ) {
                              return [];
                            }
                            return [
                              <View
                                key={cell.id}
                                style={{ width: '100%', marginBottom: 6 }}
                              >
                                {renderMobileCell(cell, true)}
                              </View>,
                            ];
                          }),
                        )}
                  </View>
                </GestureDetector>
              </ScrollView>
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
