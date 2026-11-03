import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  ScrollView,
  Text,
  View,
  type DimensionValue,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  formatOverlay,
  isClusterMetricRegister,
  tagValueForRegister,
  type TagSnapshot,
} from '@tele-pendant/shared';
import { io, Socket } from 'socket.io-client';
import { apiGet, apiPost, getApiBase } from '../api';
import type { Cell, Layout } from '../types';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import { Banner, ErrorText, Field, Hint } from '../ui';

function statusTone(mode: string): 'ok' | 'warn' | 'danger' {
  if (mode === 'safe_state' || mode === 'estop' || mode === 'e_stop') {
    return 'danger';
  }
  if (mode !== 'normal' && mode !== 'unknown') return 'warn';
  return 'ok';
}

export function OperatorScreen({ token }: { token: string }) {
  const { t, terror } = useLocale();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [safetyMode, setSafetyMode] = useState('unknown');
  const [height, setHeight] = useState<number | null>(null);
  const [tags, setTags] = useState<TagSnapshot | null>(null);
  const [photoOk, setPhotoOk] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const heldId = useRef<string | null>(null);
  const latched = useRef(false);

  useEffect(() => {
    let socket: Socket | null = null;
    let closed = false;
    const base = getApiBase();
    if (closed) return;
    const origin = base.replace(/\/api\/v1$/, '');
    socket = io(`${origin}/realtime`, {
      transports: ['websocket'],
      path: '/socket.io',
    });
    socketRef.current = socket;
    socket.on('safety.state', (s: { mode: string }) => setSafetyMode(s.mode));
    socket.on(
      'tags.update',
      (payload: TagSnapshot & { hoistHeightMm: number }) => {
        setHeight(payload.hoistHeightMm);
        setTags(payload);
      },
    );
    return () => {
      closed = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const layoutQuery = useQuery({
    queryKey: ['layout', token],
    queryFn: () => apiGet<Layout>('/hmi/layout', token),
  });

  const pulseDeadman = useCallback(() => {
    socketRef.current?.emit('deadman.pulse');
    return apiPost('/safety/deadman/pulse', undefined, token).catch(
      () => undefined,
    );
  }, [token]);

  const dropDeadman = useCallback(() => {
    socketRef.current?.emit('deadman.release');
    return apiPost('/safety/deadman/release', undefined, token).catch(
      () => undefined,
    );
  }, [token]);

  useEffect(() => {
    if (!holdingId) return;
    const id = setInterval(() => {
      void pulseDeadman();
    }, 400);
    return () => clearInterval(id);
  }, [holdingId, pulseDeadman]);

  const pressCell = async (cell: Cell) => {
    setError(null);
    heldId.current = cell.id;
    try {
      if (cell.isMotion) {
        setHoldingId(cell.id);
        await pulseDeadman();
        if (heldId.current !== cell.id) {
          await dropDeadman();
          return;
        }
      }
      await apiPost(
        `/hmi/cells/${cell.id}/activate`,
        {
          value: true,
          safeActionPin: cell.requiresSafeAction ? pin || undefined : undefined,
        },
        token,
      );
      if (heldId.current !== cell.id) {
        if (cell.isMotion) {
          await apiPost(
            `/hmi/cells/${cell.id}/activate`,
            { value: false },
            token,
          ).catch(() => undefined);
          await dropDeadman();
        }
        return;
      }
      if (cell.isMotion) latched.current = true;
    } catch (err) {
      setError(err instanceof Error ? terror(err.message) : 'Activate failed');
      if (heldId.current === cell.id) {
        heldId.current = null;
        latched.current = false;
        setHoldingId(null);
        if (cell.isMotion) await dropDeadman();
      }
    }
  };

  const releaseCell = async (cell: Cell) => {
    if (!cell.isMotion) return;
    const mine = heldId.current === cell.id;
    heldId.current = null;
    setHoldingId(null);
    if (!mine) return;
    const wasLatched = latched.current;
    latched.current = false;
    try {
      if (wasLatched) {
        await apiPost(
          `/hmi/cells/${cell.id}/activate`,
          { value: false },
          token,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? terror(err.message) : 'Release failed');
    } finally {
      await dropDeadman();
    }
  };

  const imageUrl = layoutQuery.data?.background?.imageUrl ?? '';
  const tone = statusTone(safetyMode);
  useEffect(() => {
    setPhotoOk(true);
  }, [imageUrl]);

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

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-4 pb-12"
    >
      <HelpTip id="tour.operator.banner">
        <Banner>
          {t('safety')}: {safetyMode} · H {height ?? '—'} mm
          {holdingId ? ` · ${t('deadmanHold')}` : ''}
        </Banner>
      </HelpTip>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <HelpTip id="tour.operator.safePin">
        <Field label={t('safePin')} value={pin} onChangeText={setPin} secure />
      </HelpTip>
      <HelpTip id="tour.operator.graphic">
        <View
          className="relative mb-3 min-h-[220px] overflow-hidden rounded-2xl border border-white/10"
          style={{ backgroundColor: '#07090c' }}
        >
          {imageUrl && photoOk ? (
            <Image
              source={{ uri: imageUrl }}
              className="absolute inset-0 h-full w-full"
              style={{ opacity: 0.32 }}
              onError={() => setPhotoOk(false)}
            />
          ) : null}
          <View
            className="absolute inset-0"
            style={{
              backgroundColor: 'rgba(0,0,0,0.35)',
            }}
          />
          <View className="z-10 flex-row items-center justify-between px-3.5 pb-2 pt-3">
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
          <View className="relative z-10 min-h-[96px] flex-1 overflow-hidden">
            {(layoutQuery.data?.overlays ?? [])
              .filter(
                (overlay) => !isClusterMetricRegister(overlay.register?.name),
              )
              .map((overlay) => (
                <View
                  key={overlay.id}
                  className="absolute min-w-[72px] items-center rounded-lg border border-white/20 bg-black/70 px-2.5 py-1.5"
                  style={{
                    left: `${overlay.xPct}%` as DimensionValue,
                    top: `${overlay.yPct}%` as DimensionValue,
                    transform: [{ translateX: -36 }, { translateY: -18 }],
                  }}
                >
                  <Text
                    className="text-[9px] font-medium uppercase text-white/55"
                    style={{ letterSpacing: 1.8 }}
                  >
                    {overlay.label}
                  </Text>
                  <Text className="font-mono text-sm font-semibold text-white">
                    {String(
                      formatOverlay(
                        overlay.format,
                        tagValueForRegister(tags, overlay.register?.name),
                      ),
                    )}
                  </Text>
                </View>
              ))}
          </View>
          <View className="z-10 flex-row border-t border-white/10 bg-[#07090c]/95 px-1 pb-2.5 pt-2">
            {(
              [
                {
                  label: 'Height',
                  value: String(height ?? tags?.hoistHeightMm ?? '—'),
                  unit: 'mm',
                },
                {
                  label: 'Load',
                  value: String(tags?.loadKg ?? '—'),
                  unit: 'kg',
                },
                {
                  label: 'Drive',
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
                <Text className="font-mono text-xl font-semibold text-white">
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
      <HelpTip id="tour.operator.matrix">
        <View className="flex-row flex-wrap gap-2">
          {grid &&
            grid.cells.map((cell, idx) => {
              const cellWidth: DimensionValue =
                grid.cols > 0
                  ? (`${Math.floor(100 / grid.cols) - 2}%` as DimensionValue)
                  : '31%';
              return cell ? (
                <View
                  key={cell.id}
                  className={`min-h-[88px] items-center justify-center rounded-[10px] border p-2 ${
                    cell.style === 'estop'
                      ? 'border-estop-border bg-estop'
                      : 'border-cell-border bg-cell'
                  } ${holdingId === cell.id ? 'border-2 border-success' : ''}`}
                  style={{ width: cellWidth }}
                  onStartShouldSetResponder={() => true}
                  onResponderTerminationRequest={() => false}
                  onResponderGrant={() => {
                    void pressCell(cell);
                  }}
                  onResponderRelease={() => {
                    void releaseCell(cell);
                  }}
                  onResponderTerminate={() => {
                    void releaseCell(cell);
                  }}
                >
                  <Text className="text-center font-bold text-foreground">
                    {cell.label}
                  </Text>
                </View>
              ) : (
                <View
                  key={`e-${idx}`}
                  className="min-h-[88px]"
                  style={{ width: cellWidth }}
                />
              );
            })}
        </View>
      </HelpTip>
      <HelpTip id="tour.operator.holdHint">
        <Hint>{t('holdHint')}</Hint>
      </HelpTip>
    </ScrollView>
  );
}
