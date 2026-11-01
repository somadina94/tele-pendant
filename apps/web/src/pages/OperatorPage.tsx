import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiGet, apiPost, CellDto, HmiLayout, LiveTags } from '../lib/api';
import { useT } from '../lib/i18n';
import { formatOverlay, tagValueForRegister } from '../lib/operator-helpers';
import { getRealtimeSocket } from '../lib/realtime';

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

  return (
    <div className="operator">
      <header className="op-header">
        <div>
          <h1>Tele-Pendant</h1>
          <p className="lede">{t('operatorLede')}</p>
        </div>
        <nav className="op-nav">
          <Link to="/media">{t('media')}</Link>
          <Link to="/assistant">{t('assistant')}</Link>
          <Link to="/face">{t('face')}</Link>
          <Link to="/ops">{t('ops')}</Link>
          <Link to="/admin">{t('config')}</Link>
          <Link to="/audit">{t('audit')}</Link>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              localStorage.removeItem('accessToken');
              window.location.href = '/';
            }}
          >
            {t('logout')}
          </button>
        </nav>
      </header>

      <div className={`banner mode-${mode}`}>
        {t('safety')}: <strong>{mode}</strong>
        {safety?.deadmanActive || holdingCellId
          ? ` · ${t('deadmanHold')}`
          : ''}
        {safety?.eStopActive ? ` · ${t('estop')}` : ''}
      </div>

      {message && <p className="error">{terror(message)}</p>}

      <div className="op-grid">
        <section
          className="graphic"
          style={{
            background:
              layout?.background?.cssBackground ??
              'linear-gradient(160deg, #1a2332, #0f1419)',
          }}
        >
          {imageUrl && photoOk ? (
            <img
              className="graphic-photo"
              alt="Plant background"
              src={imageUrl}
              onError={() => setPhotoOk(false)}
            />
          ) : null}
          <h2>{layout?.background?.name ?? t('plantGraphic')}</h2>
          {(layout?.overlays ?? []).map((o) => (
            <motion.div
              key={o.id}
              className="overlay"
              style={{ left: `${o.xPct}%`, top: `${o.yPct}%` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <span className="overlay-label">{o.label}</span>
              <strong>
                {formatOverlay(
                  o.format,
                  tagValueForRegister(tags, o.register?.name),
                )}
              </strong>
            </motion.div>
          ))}
          <div className="tag-strip">
            <span>H {tags?.hoistHeightMm ?? '—'} mm</span>
            <span>Load {tags?.loadKg ?? '—'} kg</span>
            <span>{tags?.motorRunning ? 'RUN' : 'IDLE'}</span>
          </div>
        </section>

        <section className="matrix-panel">
          <h2>{t('controlMatrix')}</h2>
          <label className="pin">
            {t('safePin')}
            <input
              value={safePin}
              onChange={(e) => setSafePin(e.target.value)}
              type="password"
              placeholder="SAFE_ACTION_PIN"
              autoComplete="off"
            />
          </label>
          <p className="hint">{t('pinHint')}</p>
          {grid && (
            <div
              className="matrix"
              style={{
                gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
              }}
            >
              {grid.cells.map((cell, idx) =>
                cell ? (
                  <motion.button
                    key={cell.id}
                    type="button"
                    className={`cell style-${cell.style} ${
                      holdingCellId === cell.id ? 'holding' : ''
                    }`}
                    whileTap={{ scale: 0.96 }}
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
                  </motion.button>
                ) : (
                  <div key={`empty-${idx}`} className="cell empty" />
                ),
              )}
            </div>
          )}
          <p className="hint">
            {t('holdHint')}
          </p>
        </section>
      </div>
    </div>
  );
}
