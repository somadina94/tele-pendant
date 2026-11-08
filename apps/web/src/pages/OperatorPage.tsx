import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Circle, Play, ShieldAlert } from 'lucide-react';
import {
  apiGet,
  apiPost,
  CellDto,
  ControlLease,
  HmiLayout,
  LiveTags,
} from '../lib/api';
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

function readLocalUserId(): string | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed.id?.trim() || null;
  } catch {
    return null;
  }
}

function mergeControl(
  incoming: ControlLease | null | undefined,
  prev: ControlLease | null,
): ControlLease | null {
  if (!incoming) return prev;
  const me = readLocalUserId();
  return {
    ...incoming,
    youHold: Boolean(
      incoming.youHold ||
      (me && incoming.holderUserId && me === incoming.holderUserId),
    ),
  };
}

export function OperatorPage() {
  const queryClient = useQueryClient();
  const { t, terror } = useT();
  const [tags, setTags] = useState<LiveTags | null>(null);
  const [safety, setSafety] = useState<HmiLayout['safety'] | null>(null);
  const [control, setControl] = useState<ControlLease | null>(null);
  const controlRef = useRef<ControlLease | null>(null);
  const [holdingCellId, setHoldingCellId] = useState<string | null>(null);
  const heldRef = useRef<string | null>(null);
  const [jogSpeed, setJogSpeed] = useState<'slow' | 'fast'>('fast');
  const jogSpeedRef = useRef<'slow' | 'fast'>('fast');
  const [safePin, setSafePin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [photoOk, setPhotoOk] = useState(true);
  const [liveFallback, setLiveFallback] = useState(false);

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
    const onTags = (payload: LiveTags) =>
      setTags((prev) => ({
        ...prev,
        ...payload,
        values: { ...prev?.values, ...payload.values },
      }));
    const onSafety = (payload: HmiLayout['safety']) => {
      setSafety(payload);
      if (payload.control) {
        setControl((prev) => mergeControl(payload.control, prev));
      }
    };
    socket.on('tags.update', onTags);
    socket.on('safety.state', onSafety);
    return () => {
      socket.off('tags.update', onTags);
      socket.off('safety.state', onSafety);
    };
  }, []);

  /**
   * HTTP backup for live tags. Host nginx often stalls Socket.IO in production
   * (local Docker without that proxy looks fine); keep values moving via REST.
   */
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const payload = await apiGet<LiveTags & { at: string | null }>(
          '/realtime/tags',
        );
        if (cancelled || payload.at == null) return;
        setTags((prev) => ({
          ...prev,
          ...payload,
          values: { ...prev?.values, ...payload.values },
        }));
      } catch {
        // ignore transient errors
      }
    };
    void pull();
    const id = window.setInterval(pull, 300);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  /** FEAT-A5: claim exclusive control; heartbeat while this Operator is open. */
  useEffect(() => {
    let cancelled = false;
    const apply = (next: ControlLease) => {
      if (cancelled) return;
      setControl((prev) => mergeControl(next, prev));
    };
    const refresh = async () => {
      try {
        apply(await apiGet<ControlLease>('/safety/control'));
      } catch {
        // ignore transient errors
      }
    };
    const claim = async () => {
      try {
        apply(await apiPost<ControlLease>('/safety/control/claim'));
      } catch {
        await refresh();
      }
    };
    void claim();
    const id = window.setInterval(() => {
      const current = controlRef.current;
      if (current?.youHold) {
        void apiPost<ControlLease>('/safety/control/heartbeat')
          .then(apply)
          .catch(() => void refresh());
      } else {
        void refresh();
      }
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      void Promise.resolve(apiPost('/safety/control/release')).catch(
        () => undefined,
      );
    };
  }, []);

  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!holdingCellId) return;
    const cellId = holdingCellId;
    const pulse = () => {
      socket.emit('deadman.pulse');
      void apiPost('/safety/deadman/pulse').catch(() => undefined);
      // Re-assert motion coil so a brief PLC glitch does not freeze live values mid-hold.
      void apiPost(`/hmi/cells/${cellId}/activate`, {
        value: true,
        speed: jogSpeedRef.current,
        refresh: true,
      }).catch(() => undefined);
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
    getRealtimeSocket().emit('deadman.pulse');
    void apiPost('/safety/deadman/pulse').catch(() => undefined);
  }, []);

  const releaseDeadman = useCallback(() => {
    getRealtimeSocket().emit('deadman.release');
    void apiPost('/safety/deadman/release').catch(() => undefined);
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
    if (cell.isMotion) {
      heldRef.current = cell.id;
      setHoldingCellId(cell.id);
      pulseDeadman();
    }
    const speed =
      cell.isMotion && (cell.variableSpeed ?? true)
        ? jogSpeedRef.current
        : undefined;
    try {
      await activate.mutateAsync({ id: cell.id, value: true, speed });
    } catch {
      if (heldRef.current === cell.id) {
        heldRef.current = null;
        setHoldingCellId(null);
        releaseDeadman();
      }
    }
  }

  async function releaseCell(cell: CellDto) {
    if (!cell.isMotion) return;
    const mine = heldRef.current === cell.id;
    if (heldRef.current === cell.id) heldRef.current = null;
    setHoldingCellId((current) => (current === cell.id ? null : current));
    if (!mine) return;
    releaseDeadman();
    try {
      await activate.mutateAsync({
        id: cell.id,
        value: false,
        speed: (cell.variableSpeed ?? true) ? jogSpeedRef.current : undefined,
      });
    } catch {
      // The coil drop is best-effort. The hold indicator is already clear.
    }
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

  async function claimControl() {
    setMessage(null);
    try {
      setControl(
        mergeControl(
          await apiPost<ControlLease>('/safety/control/claim'),
          null,
        ),
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('err.control'));
      try {
        setControl(
          mergeControl(await apiGet<ControlLease>('/safety/control'), null),
        );
      } catch {
        // ignore
      }
    }
  }

  async function releaseControl() {
    setMessage(null);
    try {
      setControl(
        mergeControl(
          await apiPost<ControlLease>('/safety/control/release'),
          null,
        ),
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Release failed');
    }
  }

  async function stealControl() {
    setMessage(null);
    try {
      setControl(
        mergeControl(
          await apiPost<ControlLease>('/safety/control/steal', {
            pin: safePin,
          }),
          null,
        ),
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'PIN does not match');
    }
  }

  const layout = layoutQuery.data;
  const youHold = Boolean(control?.youHold);
  const controlHeldByOther = Boolean(control?.held && !youHold);
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
            {youHold ? (
              <Badge variant="secondary">{t('controlYou')}</Badge>
            ) : controlHeldByOther ? (
              <Badge variant="outline">
                {t('controlHeldBy')}{' '}
                {control?.holderDisplayName || control?.holderUserId}
              </Badge>
            ) : (
              <Badge variant="outline">{t('controlFree')}</Badge>
            )}
            {safety?.deadmanActive || holdingCellId ? (
              <Badge variant="secondary">{t('deadmanHold')}</Badge>
            ) : null}
            {safety?.eStopActive ? (
              <Badge variant="destructive" className="estop-mark">
                {t('estop')}
              </Badge>
            ) : null}
            {youHold ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => void releaseControl()}
              >
                {t('releaseControl')}
              </Button>
            ) : controlHeldByOther ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 px-2"
                onClick={() => void stealControl()}
              >
                {t('stealControl')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 px-2"
                onClick={() => void claimControl()}
              >
                {t('claimControl')}
              </Button>
            )}
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
                    {controlHeldByOther ? (
                      <span className="basis-full text-[11px] text-muted-foreground">
                        {t('stealControlHint')}
                      </span>
                    ) : null}
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
