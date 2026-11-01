import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, Text, View, type DimensionValue } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { formatOverlay, tagValueForRegister, type TagSnapshot } from '@tele-pendant/shared';
import { io, Socket } from 'socket.io-client';
import { apiGet, apiPost, getApiBase } from '../api';
import type { Cell, Layout } from '../types';
import { useLocale } from '../locale';
import { Field, styles } from '../ui';

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
    void (async () => {
      const base = await getApiBase();
      if (closed) return;
      const origin = base.replace(/\/api\/v1$/, '');
      socket = io(`${origin}/realtime`, {
        transports: ['websocket'],
        path: '/socket.io',
      });
      socketRef.current = socket;
      socket.on('safety.state', (s: { mode: string }) => setSafetyMode(s.mode));
      socket.on('tags.update', (payload: TagSnapshot & { hoistHeightMm: number }) => {
        setHeight(payload.hoistHeightMm);
        setTags(payload);
      });
    })();
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
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.banner}>
        {t('safety')}: {safetyMode} · H {height ?? '—'} mm
        {holdingId ? ` · ${t('deadmanHold')}` : ''}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Field label={t('safePin')} value={pin} onChangeText={setPin} secure />
      <Text style={styles.hint}>{t('pinHint')}</Text>
      <View
        style={[
          styles.graphic,
          {
            backgroundColor: panelColor(
              layoutQuery.data?.background?.cssBackground,
            ),
          },
        ]}
      >
        {imageUrl && photoOk ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.graphicPhoto}
            onError={() => setPhotoOk(false)}
          />
        ) : null}
        <Text style={styles.cellText}>
          {layoutQuery.data?.background?.name ?? t('plantGraphic')}
        </Text>
        {(layoutQuery.data?.overlays ?? []).map((overlay) => (
          <View
            key={overlay.id}
            style={[
              styles.overlay,
              { left: `${overlay.xPct}%`, top: `${overlay.yPct}%` },
            ]}
          >
            <Text style={styles.hint}>{overlay.label}</Text>
            <Text style={styles.cellText}>
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
      <View style={styles.matrix}>
        {grid &&
          grid.cells.map((cell, idx) => {
            const cellWidth: DimensionValue =
              grid.cols > 0
                ? (`${Math.floor(100 / grid.cols) - 2}%` as DimensionValue)
                : '31%';
            return cell ? (
              <View
                key={cell.id}
                style={[
                  styles.cell,
                  { width: cellWidth },
                  cell.style === 'estop' && styles.estop,
                  holdingId === cell.id && styles.holding,
                ]}
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
                <Text style={styles.cellText}>{cell.label}</Text>
              </View>
            ) : (
              <View
                key={`e-${idx}`}
                style={[styles.empty, { width: cellWidth }]}
              />
            );
          })}
      </View>
      <Text style={styles.hint}>
        {t('holdHint')}
      </Text>
    </ScrollView>
  );
}
