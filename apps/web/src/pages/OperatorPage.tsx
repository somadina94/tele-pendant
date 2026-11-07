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
import { getRealtimeSocket } from '../lib/realtime';
import { HelpTip } from '../lib/tour';
import { PageSpinner } from '@/components/page-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    const onSafety = (payload: HmiLayout['safety']) => setSafety(payload);
    socket.on('tags.update', onTags);
    socket.on('safety.state', onSafety);
    return () => {
      socket.off('tags.update', onTags);
      socket.off('safety.state', onSafety);
    };
  }, []);

  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!holdingCellId) return;
    const id = window.setInterval(() => {
      socket.emit('deadman.pulse');
    }, 400);
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

  return (
    <div className="operator-shell mx-auto flex w-full max-w-5xl flex-col gap-1.5 md:h-full md:min-h-0 md:gap-3">
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

      <HelpTip id="tour.operator.graphic">
        <div
          className="plant-graphic"
          style={cssBackground ? { background: cssBackground } : undefined}
        >
          {imageUrl && photoOk ? (
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
                  (safety?.eStopActive || mode === 'safe_state') && 'danger',
                  !safety?.eStopActive &&
                    mode !== 'normal' &&
                    mode !== 'safe_state' &&
                    'warn',
                )}
              />
              {mode}
            </div>
          </div>
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
              <span className="plant-metric-value">{tags?.loadKg ?? '—'}</span>
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

      <Card className="min-h-0 shrink overflow-visible md:flex-1 md:overflow-visible">
        <CardHeader className="hidden space-y-0 px-4 py-1.5 md:block md:space-y-0 md:py-2">
          <CardTitle className="text-sm">{t('controlMatrix')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 px-2 pb-2 pt-2 md:space-y-1.5 md:px-3 md:pb-3 md:pt-0">
          <HelpTip id="tour.operator.safePin">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Label
                htmlFor="safe-pin"
                className="shrink-0 whitespace-nowrap text-xs md:text-sm"
              >
                {t('safePin')}
              </Label>
              <Input
                id="safe-pin"
                className="h-9 min-h-9 min-w-[5rem] max-w-[11rem] flex-1 basis-28 md:max-w-[9rem]"
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
                className="h-9 min-h-9 shrink-0 px-2 text-xs md:h-9 md:min-h-9 md:px-3 md:text-sm"
                onClick={() => void resetEStop()}
              >
                {t('resetEstop')}
              </Button>
            </div>
          </HelpTip>
          {showJogSpeed ? (
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label={t('jogSpeed')}
            >
              <span className="text-xs text-muted-foreground md:text-sm">
                {t('jogSpeed')}
              </span>
              <Button
                type="button"
                size="sm"
                variant={jogSpeed === 'slow' ? 'default' : 'outline'}
                className="h-9 min-h-9"
                aria-pressed={jogSpeed === 'slow'}
                onClick={() => setJogSpeed('slow')}
              >
                {t('jogSlow')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={jogSpeed === 'fast' ? 'default' : 'outline'}
                className="h-9 min-h-9"
                aria-pressed={jogSpeed === 'fast'}
                onClick={() => setJogSpeed('fast')}
              >
                {t('jogFast')}
              </Button>
            </div>
          ) : null}
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
                const cellState = resolveMatrixCellUiState({
                  style: cell.style,
                  isMotion: cell.isMotion,
                  isHolding: holdingCellId === cell.id,
                  safety: safety ?? layout.safety,
                  tags,
                  statusRegisterName: cell.statusRegister?.name,
                });
                const StateIcon = CELL_STATE_ICON[cellState];
                const stateLabel = t(MATRIX_CELL_STATE_I18N[cellState]);
                return (
                  <Button
                    key={cell.id}
                    type="button"
                    variant={
                      cell.style === 'estop' ? 'destructive' : 'secondary'
                    }
                    data-cell-state={cellState}
                    className={cn(
                      'matrix-cell h-auto',
                      `state-${cellState}`,
                      cell.style === 'estop' && 'estop',
                    )}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      trySetPointerCapture(e.currentTarget, e.pointerId);
                      void pressCell(cell);
                    }}
                    onPointerMove={(e) => {
                      if (heldRef.current !== cell.id || !cell.isMotion) return;
                      if (
                        pointerLeftElement(
                          e.currentTarget,
                          e.clientX,
                          e.clientY,
                        )
                      ) {
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
                    <span className="matrix-cell-state">
                      <StateIcon className="size-2.5" strokeWidth={2.5} />
                      {stateLabel}
                    </span>
                    {(cell.feedbackRegister || cell.statusRegister) && (
                      <span className="matrix-cell-meta">
                        {cell.feedbackRegister
                          ? `F ${String(
                              tagValueForRegister(
                                tags,
                                cell.feedbackRegister.name,
                              ),
                            )}`
                          : null}
                        {cell.feedbackRegister && cell.statusRegister
                          ? ' · '
                          : null}
                        {cell.statusRegister
                          ? `S ${String(
                              tagValueForRegister(
                                tags,
                                cell.statusRegister.name,
                              ),
                            )}`
                          : null}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          </HelpTip>
          <HelpTip id="tour.operator.holdHint">
            <p className="hidden text-xs text-muted-foreground md:block">
              {t('holdHint')}
            </p>
          </HelpTip>
        </CardContent>
      </Card>
    </div>
  );
}
