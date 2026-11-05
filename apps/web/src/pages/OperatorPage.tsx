import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { apiGet, apiPost, CellDto, HmiLayout, LiveTags } from '../lib/api';
import { useT } from '../lib/i18n';
import {
  formatOverlay,
  isClusterMetricRegister,
  tagValueForRegister,
} from '../lib/operator-helpers';
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

function releasePointerIfCaptured(
  target: HTMLElement,
  pointerId: number,
): void {
  if (
    typeof target.releasePointerCapture === 'function' &&
    typeof target.hasPointerCapture === 'function' &&
    target.hasPointerCapture(pointerId)
  ) {
    target.releasePointerCapture(pointerId);
  }
}

export function OperatorPage() {
  const queryClient = useQueryClient();
  const { t, terror } = useT();
  const [tags, setTags] = useState<LiveTags | null>(null);
  const [safety, setSafety] = useState<HmiLayout['safety'] | null>(null);
  const [holdingCellId, setHoldingCellId] = useState<string | null>(null);
  const heldRef = useRef<string | null>(null);
  const [safePin, setSafePin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [photoOk, setPhotoOk] = useState(true);

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
    }) =>
      apiPost(`/hmi/cells/${args.id}/activate`, {
        value: args.value,
        safeActionPin: args.safeActionPin,
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
    try {
      await activate.mutateAsync({ id: cell.id, value: true });
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
      await activate.mutateAsync({ id: cell.id, value: false });
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
  const imageUrl = layout?.background?.imageUrl ?? '';
  const cssBackground = layout?.background?.cssBackground?.trim() || '';
  const mode = safety?.mode ?? layout?.safety.mode ?? 'unknown';

  useEffect(() => {
    setPhotoOk(true);
  }, [imageUrl]);

  if (layoutQuery.isLoading) {
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
              {layout?.background?.name ?? t('plantGraphic')}
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
            {(layout?.overlays ?? [])
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

      <Card className="min-h-0 shrink overflow-visible md:flex-1 md:overflow-auto">
        <CardHeader className="hidden space-y-0 px-4 py-2 md:block md:space-y-1 md:py-3">
          <CardTitle className="text-base">{t('controlMatrix')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 px-2 pb-2 pt-2 md:space-y-2 md:px-4 md:pb-4 md:pt-0">
          <HelpTip id="tour.operator.safePin">
            <div className="grid max-w-md grid-cols-1 gap-1 max-md:grid-cols-[1fr_auto] max-md:items-center md:max-w-xs md:gap-1.5">
              <Label
                htmlFor="safe-pin"
                className="text-xs max-md:col-span-2 md:text-base"
              >
                {t('safePin')}
              </Label>
              <Input
                id="safe-pin"
                className="h-12 min-h-12 md:h-10 md:min-h-10"
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
                className="h-12 min-h-12 shrink-0 px-2 text-xs md:h-10 md:min-h-10 md:px-4 md:text-sm"
                onClick={() => void resetEStop()}
              >
                {t('resetEstop')}
              </Button>
            </div>
          </HelpTip>
          <HelpTip id="tour.operator.matrix">
            <div
              className="matrix-grid"
              style={{
                gridTemplateColumns: `repeat(${grid?.cols ?? 1}, minmax(0, 1fr))`,
              }}
            >
              {(grid?.cells ?? []).map((cell, idx) =>
                cell ? (
                  <Button
                    key={cell.id}
                    type="button"
                    variant={
                      cell.style === 'estop' ? 'destructive' : 'secondary'
                    }
                    className={cn(
                      'matrix-cell h-auto',
                      holdingCellId === cell.id && 'holding',
                      cell.style === 'estop' && 'estop',
                    )}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      if (
                        typeof e.currentTarget.setPointerCapture === 'function'
                      ) {
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }
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
                        finishCellPointer(
                          cell,
                          e.currentTarget,
                          e.pointerId,
                        );
                      }
                    }}
                    onPointerUp={(e) =>
                      finishCellPointer(
                        cell,
                        e.currentTarget,
                        e.pointerId,
                      )
                    }
                    onPointerLeave={(e) =>
                      finishCellPointer(
                        cell,
                        e.currentTarget,
                        e.pointerId,
                      )
                    }
                    onPointerCancel={(e) =>
                      finishCellPointer(
                        cell,
                        e.currentTarget,
                        e.pointerId,
                      )
                    }
                    onLostPointerCapture={() => {
                      if (heldRef.current === cell.id && cell.isMotion) {
                        void releaseCell(cell);
                      }
                    }}
                    aria-label={cell.label}
                  >
                    <span className="matrix-cell-label">{cell.label}</span>
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
                ) : (
                  <div
                    key={`empty-${idx}`}
                    className="matrix-grid-hole min-h-11 md:min-h-16"
                    aria-hidden
                  />
                ),
              )}
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
