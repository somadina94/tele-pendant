import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Circle, Play, ShieldAlert } from 'lucide-react';
import { apiGet, apiPost, CellDto, HmiLayout, LiveTags } from '../lib/api';
import { useT } from '../lib/i18n';
import {
  formatOverlay,
  isClusterMetricRegister,
  tagValueForRegister,
} from '../lib/operator-helpers';
import {
  isOperatorScreenReady,
  MATRIX_CELL_STATE_CODE,
  MATRIX_CELL_STATE_I18N,
  operatorNeedsLiveTags,
  resolveMatrixCellUiState,
  type MatrixCellUiState,
} from '@tele-pendant/shared';
import { useControlLease } from '../lib/control-lease';
import { applyLiveTagsState, shouldApplyLiveTags } from '../lib/live-tags';
import { motionDebug } from '../lib/motion-debug';
import { getRealtimeSocket } from '../lib/realtime';
import { HelpTip } from '../lib/tour';
import { CraneMimic } from '@/components/crane-mimic';
import { PageSpinner } from '@/components/page-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const CELL_STATE_ICON: Record<MatrixCellUiState, typeof Circle> = {
  idle: Circle,
  running: Play,
  blocked: Ban,
  fault: AlertTriangle,
};

function pointerLeftElement(
  element: Element,
  clientX: number,
  clientY: number,
): boolean {
  const rect = element.getBoundingClientRect();
  return (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  );
}

function trySetPointerCapture(target: HTMLElement, pointerId: number): void {
  try {
    if (typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(pointerId);
    }
  } catch {
    // TP-31: touch/synthetic pointers can throw InvalidStateError.
  }
}

function releasePointerIfCaptured(
  target: HTMLElement,
  pointerId: number,
): void {
  try {
    if (
      typeof target.releasePointerCapture === 'function' &&
      typeof target.hasPointerCapture === 'function' &&
      target.hasPointerCapture(pointerId)
    ) {
      target.releasePointerCapture(pointerId);
    }
  } catch {
    // TP-31: release can throw if capture was never held.
  }
}

export function OperatorPage() {
  const queryClient = useQueryClient();
  const { t, terror } = useT();
  const { control, youHold } = useControlLease();
  const controlRef = useRef(control);
  const [tags, setTags] = useState<LiveTags | null>(null);
  const [safety, setSafety] = useState<HmiLayout['safety'] | null>(null);
  const [holdingCellId, setHoldingCellId] = useState<string | null>(null);
  const heldRef = useRef<string | null>(null);
  const [jogSpeed, setJogSpeed] = useState<'slow' | 'fast'>('fast');
  const jogSpeedRef = useRef<'slow' | 'fast'>('fast');
  const [safePin, setSafePin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [photoOk, setPhotoOk] = useState(true);
  const [liveFallback, setLiveFallback] = useState(false);
  const tagOrderRef = useRef<{ lastSeq: number; lastAt: string | null }>({
    lastSeq: 0,
    lastAt: null,
  });
  const tagsPullInFlight = useRef(false);
  const lastWsTagAt = useRef(0);
  const holdPulseCount = useRef(0);
  const lastTagLogAt = useRef(0);
  /** Bumps on release so a late activate(true) cannot leave a coil latched. */
  const holdGen = useRef(0);

  const applyLiveTags = useCallback((payload: LiveTags) => {
    if (
      !shouldApplyLiveTags(
        tagOrderRef.current.lastSeq,
        tagOrderRef.current.lastAt,
        payload,
      )
    ) {
      motionDebug('tags.dropped-stale', {
        seq: payload.seq,
        at: payload.at,
        lastSeq: tagOrderRef.current.lastSeq,
        lastAt: tagOrderRef.current.lastAt,
      });
      return;
    }
    tagOrderRef.current = applyLiveTagsState(tagOrderRef.current, payload);
    const now = Date.now();
    if (heldRef.current || now - lastTagLogAt.current > 1000) {
      lastTagLogAt.current = now;
      motionDebug('tags.apply', {
        seq: payload.seq,
        at: payload.at,
        hoistHeightMm: payload.hoistHeightMm,
        trolleyPositionMm: payload.trolleyPositionMm,
        holding: heldRef.current,
      });
    }
    setTags((prev) => ({
      ...prev,
      ...payload,
      values: { ...prev?.values, ...payload.values },
    }));
  }, []);

  useEffect(() => {
    controlRef.current = control;
  }, [control]);

  useEffect(() => {
    jogSpeedRef.current = jogSpeed;
  }, [jogSpeed]);

  const layoutQuery = useQuery({
    queryKey: ['hmi-layout'],
    queryFn: () => apiGet<HmiLayout>('/hmi/layout'),
  });

  useEffect(() => {
    const socket = getRealtimeSocket();
    const onTags = (payload: LiveTags) => {
      lastWsTagAt.current = Date.now();
      applyLiveTags(payload);
    };
    const onSafety = (payload: HmiLayout['safety']) => {
      if (heldRef.current) {
        const pulseAt = (payload as { lastClientPulseAt?: string | null })
          .lastClientPulseAt;
        motionDebug('safety.state', {
          mode: payload.mode,
          deadmanActive: payload.deadmanActive,
          eStopActive: payload.eStopActive,
          lastClientPulseAt: pulseAt ?? null,
        });
      }
      setSafety(payload);
    };
    const onConnect = () => {
      motionDebug('ws.connect', {
        id: socket.id,
        transport: socket.io?.engine?.transport?.name,
      });
    };
    const onDisconnect = (reason: string) => {
      motionDebug('ws.disconnect', {
        reason,
        holding: heldRef.current,
        msSinceLastTag: Date.now() - (lastWsTagAt.current || Date.now()),
      });
    };
    const onReconnect = (attempt: number) => {
      motionDebug('ws.reconnect', {
        attempt,
        id: socket.id,
        transport: socket.io?.engine?.transport?.name,
      });
    };
    socket.on('tags.update', onTags);
    socket.on('safety.state', onSafety);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io?.on('reconnect', onReconnect);
    return () => {
      socket.off('tags.update', onTags);
      socket.off('safety.state', onSafety);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io?.off('reconnect', onReconnect);
    };
  }, [applyLiveTags]);

  /**
   * HTTP tags only when Socket.IO has gone quiet (prod proxy stall).
   * When WS is healthy — same path as local — do not poll REST.
   */
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const socket = getRealtimeSocket();
      if (socket.connected && Date.now() - lastWsTagAt.current < 4_000) {
        return;
      }
      if (tagsPullInFlight.current) return;
      tagsPullInFlight.current = true;
      motionDebug('tags.http-fallback', {
        msSinceWsTag: Date.now() - (lastWsTagAt.current || 0),
        socketConnected: socket.connected,
      });
      try {
        const payload = await apiGet<LiveTags & { at: string | null }>(
          '/realtime/tags',
        );
        if (cancelled || payload.at == null) return;
        applyLiveTags(payload);
      } catch {
        // ignore transient errors
      } finally {
        tagsPullInFlight.current = false;
      }
    };
    void pull();
    const id = window.setInterval(pull, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [applyLiveTags]);

  // Match the local working hold path: WS deadman pulse only (no HTTP flood).
  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!holdingCellId) return;
    holdPulseCount.current = 0;
    const pulse = () => {
      holdPulseCount.current += 1;
      const n = holdPulseCount.current;
      motionDebug('hold.pulse', {
        n,
        cellId: holdingCellId,
        socketConnected: socket.connected,
        transport: socket.io?.engine?.transport?.name,
        msSinceLastTag: Date.now() - (lastWsTagAt.current || Date.now()),
      });
      socket.emit('deadman.pulse');
    };
    pulse();
    const id = window.setInterval(pulse, 400);
    return () => window.clearInterval(id);
  }, [holdingCellId]);

  const activate = useMutation({
    mutationFn: (args: {
      id: string;
      value: boolean;
      safeActionPin?: string;
      speed?: 'slow' | 'fast';
    }) =>
      apiPost(`/hmi/cells/${args.id}/activate`, {
        value: args.value,
        safeActionPin: args.safeActionPin,
        ...(args.speed ? { speed: args.speed } : {}),
      }),
    onError: (err: Error) => setMessage(err.message),
    onSuccess: () => {
      setMessage(null);
      void queryClient.invalidateQueries({ queryKey: ['hmi-layout'] });
    },
  });

  const pulseDeadman = useCallback(() => {
    // WS only — HTTP pulse/release doubled Modbus coil drops with the WS path.
    getRealtimeSocket().emit('deadman.pulse');
  }, []);

  const releaseDeadman = useCallback(() => {
    getRealtimeSocket().emit('deadman.release');
  }, []);

  const grid = useMemo(() => {
    const layout = layoutQuery.data;
    if (!layout) return null;
    const { rows, cols } = layout.matrix;
    const map = new Map(layout.cells.map((c) => [`${c.row}:${c.col}`, c]));
    const cells: Array<CellDto | null> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push(map.get(`${r}:${c}`) ?? null);
      }
    }
    return { rows, cols, cells };
  }, [layoutQuery.data]);

  async function pressCell(cell: CellDto) {
    setMessage(null);
    if (cell.isMotion && !controlRef.current?.youHold) {
      setMessage(
        controlRef.current?.held
          ? `${t('controlHeldBy')} ${controlRef.current.holderDisplayName || controlRef.current.holderUserId}`
          : t('err.control'),
      );
      return;
    }
    const pressGen = holdGen.current;
    if (cell.isMotion) {
      motionDebug('hold.press', {
        cellId: cell.id,
        label: cell.label,
        speed: jogSpeedRef.current,
      });
      heldRef.current = cell.id;
      setHoldingCellId(cell.id);
      pulseDeadman();
    }
    const speed =
      cell.isMotion && (cell.variableSpeed ?? true)
        ? jogSpeedRef.current
        : undefined;
    const t0 = Date.now();
    try {
      await activate.mutateAsync({ id: cell.id, value: true, speed });
      if (cell.isMotion && holdGen.current !== pressGen) {
        // Released while activate(true) was in flight — drop the coil.
        void activate
          .mutateAsync({
            id: cell.id,
            value: false,
            speed,
          })
          .catch(() => undefined);
        return;
      }
      if (cell.isMotion) {
        motionDebug('hold.activate-true', {
          cellId: cell.id,
          ms: Date.now() - t0,
        });
      }
    } catch (err) {
      if (cell.isMotion) {
        motionDebug('hold.activate-true.fail', {
          cellId: cell.id,
          ms: Date.now() - t0,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      if (heldRef.current === cell.id && holdGen.current === pressGen) {
        heldRef.current = null;
        setHoldingCellId(null);
        releaseDeadman();
      }
    }
  }

  function releaseCell(cell: CellDto) {
    if (!cell.isMotion) return;
    const mine = heldRef.current === cell.id;
    if (heldRef.current === cell.id) heldRef.current = null;
    setHoldingCellId((current) => (current === cell.id ? null : current));
    if (!mine) return;
    holdGen.current += 1;
    motionDebug('hold.release', {
      cellId: cell.id,
      label: cell.label,
      pulses: holdPulseCount.current,
    });
    releaseDeadman();
    // Fire-and-forget: awaiting activate-false stacked Modbus work behind the
    // next press and caused live-tag jumps in prod (700–2500ms).
    const t0 = Date.now();
    void activate
      .mutateAsync({
        id: cell.id,
        value: false,
        speed: (cell.variableSpeed ?? true) ? jogSpeedRef.current : undefined,
      })
      .then(() => {
        motionDebug('hold.activate-false', {
          cellId: cell.id,
          ms: Date.now() - t0,
        });
      })
      .catch((err: unknown) => {
        motionDebug('hold.activate-false.fail', {
          cellId: cell.id,
          ms: Date.now() - t0,
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }

  function finishCellPointer(
    cell: CellDto,
    target: HTMLElement,
    pointerId: number,
  ) {
    releasePointerIfCaptured(target, pointerId);
    void releaseCell(cell);
  }

  useEffect(() => {
    const dropHeld = () => {
      const id = heldRef.current;
      if (!id) return;
      const cell = layoutQuery.data?.cells.find((row) => row.id === id);
      heldRef.current = null;
      setHoldingCellId(null);
      releaseDeadman();
      if (!cell?.isMotion) return;
      void apiPost(`/hmi/cells/${id}/activate`, { value: false }).catch(
        () => undefined,
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') dropHeld();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', dropHeld);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', dropHeld);
    };
  }, [layoutQuery.data?.cells, releaseDeadman]);

  useEffect(() => {
    const modeNow = safety?.mode ?? layoutQuery.data?.safety.mode;
    if (heldRef.current) return;
    if (modeNow === 'normal' && !safety?.eStopActive) {
      setMessage((current) =>
        current && /motion blocked/i.test(current) ? null : current,
      );
    }
  }, [safety, layoutQuery.data]);

  async function resetEStop() {
    setMessage(null);
    try {
      await apiPost('/safety/reset', { pin: safePin });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'PIN does not match');
    }
  }

  const layout = layoutQuery.data;
  const needsLive = useMemo(() => operatorNeedsLiveTags(layout), [layout]);
  const showJogSpeed = useMemo(
    () =>
      Boolean(
        layout?.cells.some(
          (cell) => cell.isMotion && (cell.variableSpeed ?? true),
        ),
      ),
    [layout?.cells],
  );
  const imageUrl = layout?.background?.imageUrl ?? '';
  const cssBackground = layout?.background?.cssBackground?.trim() || '';
  const mode = safety?.mode ?? layout?.safety.mode ?? 'unknown';
  const screens = layout?.backgrounds ?? [];
  const useCustomGraphic = Boolean(imageUrl && photoOk);

  async function switchScreen(id: string) {
    if (layout?.background?.id === id) return;
    try {
      await apiPost(`/hmi/backgrounds/${id}/activate`);
      await queryClient.invalidateQueries({ queryKey: ['hmi-layout'] });
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : 'Could not switch screen',
      );
    }
  }

  useEffect(() => {
    if (!needsLive || tags) {
      setLiveFallback(false);
      return;
    }
    const id = window.setTimeout(() => setLiveFallback(true), 2500);
    return () => window.clearTimeout(id);
  }, [needsLive, tags, layout]);

  useEffect(() => {
    setPhotoOk(true);
  }, [imageUrl]);

  const operatorReady = isOperatorScreenReady({
    layoutLoaded: Boolean(layout),
    gridReady: Boolean(grid),
    needsLive,
    hasTags: tags !== null,
    liveFallback,
  });

  if (layoutQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {layoutQuery.error instanceof Error
            ? layoutQuery.error.message
            : 'Could not load operator screen'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!operatorReady || !layout || !grid) {
    return <PageSpinner label={t('operator')} />;
  }

  const stopCell =
    grid.cells.find(
      (cell) =>
        cell &&
        (cell.style === 'estop' || cell.label.trim().toUpperCase() === 'STOP'),
    ) ?? null;

  function renderMatrixCell(cell: CellDto) {
    const cellState = resolveMatrixCellUiState({
      style: cell.style,
      isMotion: cell.isMotion,
      isHolding: holdingCellId === cell.id,
      safety: safety ?? layout!.safety,
      tags,
      statusRegisterName: cell.statusRegister?.name,
    });
    const StateIcon = CELL_STATE_ICON[cellState];
    const stateLabel = t(MATRIX_CELL_STATE_I18N[cellState]);
    const isEstop = cell.style === 'estop';
    return (
      <Button
        key={cell.id}
        type="button"
        variant={isEstop ? 'destructive' : 'secondary'}
        data-cell-state={cellState}
        data-touch-min="44"
        data-stop-dock={isEstop ? 'true' : undefined}
        className={cn(
          'matrix-cell flex h-auto min-h-11 flex-row flex-nowrap items-center justify-between gap-2 whitespace-nowrap',
          `state-${cellState}`,
          isEstop && 'estop',
        )}
        disabled={cell.isMotion && !youHold}
        onPointerDown={(e) => {
          e.preventDefault();
          if (cell.isMotion && !youHold) {
            void pressCell(cell);
            return;
          }
          trySetPointerCapture(e.currentTarget, e.pointerId);
          void pressCell(cell);
        }}
        onPointerMove={(e) => {
          if (heldRef.current !== cell.id || !cell.isMotion) return;
          if (pointerLeftElement(e.currentTarget, e.clientX, e.clientY)) {
            finishCellPointer(cell, e.currentTarget, e.pointerId);
          }
        }}
        onPointerUp={(e) =>
          finishCellPointer(cell, e.currentTarget, e.pointerId)
        }
        onPointerLeave={(e) =>
          finishCellPointer(cell, e.currentTarget, e.pointerId)
        }
        onPointerCancel={(e) =>
          finishCellPointer(cell, e.currentTarget, e.pointerId)
        }
        onLostPointerCapture={() => {
          if (heldRef.current === cell.id && cell.isMotion) {
            void releaseCell(cell);
          }
        }}
        aria-label={cell.label}
        aria-description={`${MATRIX_CELL_STATE_CODE[cellState]}: ${stateLabel}`}
        title={`${MATRIX_CELL_STATE_CODE[cellState]} · ${stateLabel}`}
      >
        <span className="matrix-cell-label">{cell.label}</span>
        <span className="matrix-cell-trailing">
          <span className="matrix-cell-state">
            <StateIcon className="size-2.5 shrink-0" strokeWidth={2.5} />
            {stateLabel}
          </span>
          {(cell.feedbackRegister || cell.statusRegister) && (
            <span className="matrix-cell-meta">
              {cell.feedbackRegister
                ? `F ${String(
                    tagValueForRegister(tags, cell.feedbackRegister.name),
                  )}`
                : null}
              {cell.feedbackRegister && cell.statusRegister ? ' · ' : null}
              {cell.statusRegister
                ? `S ${String(
                    tagValueForRegister(tags, cell.statusRegister.name),
                  )}`
                : null}
            </span>
          )}
        </span>
      </Button>
    );
  }

  return (
    <div
      className="operator-shell mx-auto max-w-5xl gap-2 md:gap-3"
      data-feat="hmi-shell"
    >
      <div className="operator-body">
        <HelpTip id="tour.operator.banner">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card px-2 py-1 md:gap-2 md:px-3 md:py-1.5">
            <ShieldAlert className="size-4 text-muted-foreground" />
            <span className="text-sm">
              {t('safety')}: <strong>{mode}</strong>
            </span>
            {safety?.deadmanActive || holdingCellId ? (
              <Badge variant="secondary">{t('deadmanHold')}</Badge>
            ) : null}
            {safety?.eStopActive ? (
              <Badge variant="destructive" className="estop-mark">
                {t('estop')}
              </Badge>
            ) : null}
          </div>
        </HelpTip>

        {message ? (
          <Alert variant="destructive">
            <AlertDescription>{terror(message)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="operator-hmi-split">
          {screens.length > 1 ? (
            <div
              className="flex flex-wrap gap-1.5"
              role="tablist"
              aria-label="Plant screens"
            >
              {screens.map((screen) => (
                <Button
                  key={screen.id}
                  type="button"
                  size="sm"
                  variant={screen.active ? 'default' : 'outline'}
                  className="h-8"
                  aria-selected={screen.active}
                  onClick={() => void switchScreen(screen.id)}
                >
                  {screen.name}
                </Button>
              ))}
            </div>
          ) : null}
          <HelpTip id="tour.operator.graphic" className="operator-plant-slot">
            <div
              className="plant-graphic"
              data-feat="hmi-graphic"
              data-graphic-mode={useCustomGraphic ? 'asset' : 'mimic'}
              style={cssBackground ? { background: cssBackground } : undefined}
            >
              {useCustomGraphic ? (
                <img
                  alt="Plant background"
                  src={imageUrl}
                  onError={() => setPhotoOk(false)}
                />
              ) : null}
              <div className="plant-cluster-chrome">
                <h2 className="plant-cluster-title">
                  {layout.background?.name ?? t('plantGraphic')}
                </h2>
                <div
                  className={cn(
                    'plant-cluster-status',
                    safety?.eStopActive && 'estop-mark',
                  )}
                >
                  <span
                    className={cn(
                      'plant-cluster-status-dot',
                      (safety?.eStopActive || mode === 'safe_state') &&
                        'danger',
                      !safety?.eStopActive &&
                        mode !== 'normal' &&
                        mode !== 'safe_state' &&
                        'warn',
                    )}
                  />
                  {mode}
                </div>
              </div>
              {!useCustomGraphic ? (
                <div className="plant-mimic-stage" aria-hidden={false}>
                  <CraneMimic tags={tags} safety={safety ?? layout.safety} />
                </div>
              ) : null}
              <div className="plant-overlay-stage">
                {(layout.overlays ?? [])
                  .filter((o) => !isClusterMetricRegister(o.register?.name))
                  .map((o) => (
                    <div
                      key={o.id}
                      className="plant-overlay"
                      style={{ left: `${o.xPct}%`, top: `${o.yPct}%` }}
                    >
                      <span className="plant-overlay-label">{o.label}</span>
                      <strong className="plant-overlay-value">
                        {formatOverlay(
                          o.format,
                          tagValueForRegister(tags, o.register?.name),
                        )}
                      </strong>
                    </div>
                  ))}
              </div>
              <div className="plant-readout">
                <div className="plant-metric">
                  <span className="plant-metric-label">Height</span>
                  <span className="plant-metric-value">
                    {tags?.hoistHeightMm ?? '—'}
                  </span>
                  <span className="plant-metric-unit">mm</span>
                </div>
                <div className="plant-metric">
                  <span className="plant-metric-label">Trolley</span>
                  <span className="plant-metric-value">
                    {tags?.trolleyPositionMm ??
                      tagValueForRegister(tags, 'holding.trolleyPosition')}
                  </span>
                  <span className="plant-metric-unit">mm</span>
                </div>
                <div className="plant-metric">
                  <span className="plant-metric-label">Load</span>
                  <span className="plant-metric-value">
                    {tags?.loadKg ?? '—'}
                  </span>
                  <span className="plant-metric-unit">kg</span>
                </div>
                <div className="plant-metric">
                  <span className="plant-metric-label">Motor</span>
                  <span className="plant-metric-value">
                    {tags?.motorRunning ? 'RUN' : 'IDLE'}
                  </span>
                  <span className="plant-metric-unit">status</span>
                </div>
              </div>
            </div>
          </HelpTip>

          <Card className="operator-matrix-card">
            <CardContent className="operator-matrix-toolbar-wrap min-h-0 px-2 pb-1.5 pt-1.5 md:px-3">
              <div className="operator-matrix-toolbar">
                <HelpTip id="tour.operator.safePin">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                    <Label
                      htmlFor="safe-pin"
                      className="shrink-0 whitespace-nowrap text-[11px]"
                    >
                      {t('safePin')}
                    </Label>
                    <Input
                      id="safe-pin"
                      className="h-8 min-h-8 w-[6.5rem] max-w-[8rem] shrink-0 px-2 text-xs"
                      value={safePin}
                      onChange={(e) => setSafePin(e.target.value)}
                      type="password"
                      placeholder={t('safePin')}
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 min-h-8 shrink-0 px-2 text-[11px]"
                      onClick={() => void resetEStop()}
                    >
                      {t('resetEstop')}
                    </Button>
                  </div>
                </HelpTip>
                {showJogSpeed ? (
                  <div
                    className="flex shrink-0 flex-wrap items-center gap-1"
                    role="group"
                    aria-label={t('jogSpeed')}
                  >
                    <span className="text-[11px] text-muted-foreground">
                      {t('jogSpeed')}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant={jogSpeed === 'slow' ? 'default' : 'outline'}
                      className="h-8 min-h-8 px-2 text-[11px]"
                      aria-pressed={jogSpeed === 'slow'}
                      onClick={() => setJogSpeed('slow')}
                    >
                      {t('jogSlow')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={jogSpeed === 'fast' ? 'default' : 'outline'}
                      className="h-8 min-h-8 px-2 text-[11px]"
                      aria-pressed={jogSpeed === 'fast'}
                      onClick={() => setJogSpeed('fast')}
                    >
                      {t('jogFast')}
                    </Button>
                  </div>
                ) : null}
              </div>
              <HelpTip id="tour.operator.matrix">
                <div
                  className="matrix-grid"
                  style={{
                    gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
                  }}
                >
                  {grid.cells.map((cell, idx) => {
                    if (!cell) {
                      return (
                        <div
                          key={`empty-${idx}`}
                          className="matrix-grid-hole"
                          aria-hidden
                        />
                      );
                    }
                    // FEAT-A3: STOP lives in the fixed dock, not the scrolling matrix.
                    if (
                      stopCell &&
                      (cell.id === stopCell.id || cell.style === 'estop')
                    ) {
                      return (
                        <div
                          key={`stop-slot-${cell.id}`}
                          className="matrix-grid-hole"
                          aria-hidden
                        />
                      );
                    }
                    return renderMatrixCell(cell);
                  })}
                </div>
              </HelpTip>
              <HelpTip id="tour.operator.holdHint">
                <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">
                  {t('holdHint')}
                </p>
              </HelpTip>
            </CardContent>
          </Card>
        </div>
      </div>
      {stopCell ? (
        <div className="matrix-stop-dock" data-feat="a3-stop-dock">
          {renderMatrixCell(stopCell)}
        </div>
      ) : null}
    </div>
  );
}
