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
  tagValueForRegister,
  type TagSnapshot,
} from '@tele-pendant/shared';
import { io, Socket } from 'socket.io-client';
import { apiGet, apiPost, getApiBase } from '../api';
import type { Cell, Layout } from '../types';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import { Banner, ErrorText, Field, Hint } from '../ui';

function panelColor(css?: string | null): string {
  const value = css?.trim() ?? '';
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : '#1a2332';
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
        <>
          <Field
            label={t('safePin')}
            value={pin}
            onChangeText={setPin}
            secure
          />
          <Hint>{t('pinHint')}</Hint>
        </>
      </HelpTip>
      <HelpTip id="tour.operator.graphic">
        <View
          className="relative mb-3 min-h-[180px] overflow-hidden rounded-xl"
          style={{
            backgroundColor: panelColor(
              layoutQuery.data?.background?.cssBackground,
            ),
          }}
        >
          {imageUrl && photoOk ? (
            <Image
              source={{ uri: imageUrl }}
              className="absolute inset-0 h-full w-full"
              onError={() => setPhotoOk(false)}
            />
          ) : null}
          <Text className="p-2 text-center font-bold text-foreground">
            {layoutQuery.data?.background?.name ?? t('plantGraphic')}
          </Text>
          {(layoutQuery.data?.overlays ?? []).map((overlay) => (
            <View
              key={overlay.id}
              className="absolute"
              style={{
                left: `${overlay.xPct}%` as DimensionValue,
                top: `${overlay.yPct}%` as DimensionValue,
              }}
            >
              <Hint>{overlay.label}</Hint>
              <Text className="font-bold text-foreground">
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
