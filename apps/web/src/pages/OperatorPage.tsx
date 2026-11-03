import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { apiGet, apiPost, CellDto, HmiLayout, LiveTags } from '../lib/api';
import { useT } from '../lib/i18n';
import { formatOverlay, tagValueForRegister } from '../lib/operator-helpers';
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

export function OperatorPage() {
  const queryClient = useQueryClient();
  const { t, terror } = useT();
  const [tags, setTags] = useState<LiveTags | null>(null);
  const [safety, setSafety] = useState<HmiLayout['safety'] | null>(null);
  const [holdingCellId, setHoldingCellId] = useState<string | null>(null);
  const [safePin, setSafePin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [photoOk, setPhotoOk] = useState(true);

  const layoutQuery = useQuery({
    queryKey: ['hmi-layout'],
    queryFn: () => apiGet<HmiLayout>('/hmi/layout'),
  });

  useEffect(() => {
    const socket = getRealtimeSocket();
    const onTags = (payload: LiveTags) => setTags(payload);
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
      pulseDeadman();
      setHoldingCellId(cell.id);
    }
    try {
      await activate.mutateAsync({
        id: cell.id,
        value: true,
        safeActionPin: cell.requiresSafeAction
          ? safePin || undefined
          : undefined,
      });
    } catch {
      setHoldingCellId(null);
      releaseDeadman();
    }
  }

  async function releaseCell(cell: CellDto) {
    if (cell.isMotion) {
      try {
        await activate.mutateAsync({ id: cell.id, value: false });
      } finally {
        setHoldingCellId(null);
        releaseDeadman();
      }
    }
  }

  const layout = layoutQuery.data;
  const imageUrl = layout?.background?.imageUrl ?? '';
  const mode = safety?.mode ?? layout?.safety.mode ?? 'unknown';

  useEffect(() => {
    setPhotoOk(true);
  }, [imageUrl]);

  if (layoutQuery.isLoading) {
    return <PageSpinner label={t('operator')} />;
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-2 md:gap-3">
      <HelpTip id="tour.operator.banner">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
          <ShieldAlert className="size-4 text-muted-foreground" />
          <span className="text-sm">
            {t('safety')}: <strong>{mode}</strong>
          </span>
          {safety?.deadmanActive || holdingCellId ? (
            <Badge variant="secondary">{t('deadmanHold')}</Badge>
          ) : null}
          {safety?.eStopActive ? (
            <Badge variant="destructive">{t('estop')}</Badge>
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
          style={{
            background:
              layout?.background?.cssBackground ??
              'linear-gradient(160deg, #1a2332, #0f1419)',
          }}
        >
          {imageUrl && photoOk ? (
            <img
              alt="Plant background"
              src={imageUrl}
              onError={() => setPhotoOk(false)}
            />
          ) : null}
          {(layout?.overlays ?? []).map((o) => (
            <div
              key={o.id}
              className="plant-overlay"
              style={{ left: `${o.xPct}%`, top: `${o.yPct}%` }}
            >
              <span className="text-muted-foreground">{o.label}</span>{' '}
              <strong>
                {formatOverlay(
                  o.format,
                  tagValueForRegister(tags, o.register?.name),
                )}
              </strong>
            </div>
          ))}
          <div className="plant-readout">
            <h2 className="text-sm font-semibold text-white drop-shadow md:text-base">
              {layout?.background?.name ?? t('plantGraphic')}
            </h2>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/90 md:text-sm">
              <span>H {tags?.hoistHeightMm ?? '—'} mm</span>
              <span>Load {tags?.loadKg ?? '—'} kg</span>
              <span>{tags?.motorRunning ? 'RUN' : 'IDLE'}</span>
            </div>
          </div>
        </div>
      </HelpTip>

      <Card className="min-h-0 flex-1 overflow-auto">
        <CardHeader className="space-y-1 px-4 py-3">
          <CardTitle className="text-base">{t('controlMatrix')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-4 pt-0">
          <HelpTip id="tour.operator.safePin">
            <div className="grid max-w-xs gap-1.5">
              <Label htmlFor="safe-pin">{t('safePin')}</Label>
              <Input
                id="safe-pin"
                value={safePin}
                onChange={(e) => setSafePin(e.target.value)}
                type="password"
                placeholder="SAFE_ACTION_PIN"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">{t('pinHint')}</p>
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
                      'matrix-cell h-auto whitespace-normal',
                      holdingCellId === cell.id && 'holding',
                      cell.style === 'estop' && 'estop',
                    )}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      void pressCell(cell);
                    }}
                    onPointerUp={() => void releaseCell(cell)}
                    onPointerLeave={() => {
                      if (holdingCellId === cell.id) void releaseCell(cell);
                    }}
                    onPointerCancel={() => {
                      if (holdingCellId === cell.id) void releaseCell(cell);
                    }}
                    aria-label={cell.label}
                  >
                    {cell.label}
                  </Button>
                ) : (
                  <div key={`empty-${idx}`} className="min-h-14 md:min-h-16" />
                ),
              )}
            </div>
          </HelpTip>
          <HelpTip id="tour.operator.holdHint">
            <p className="text-xs text-muted-foreground">{t('holdHint')}</p>
          </HelpTip>
        </CardContent>
      </Card>
    </div>
  );
}
