import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type DimensionValue,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { apiGet, apiPost, getApiBase } from '../api';
import type { Cell, Layout } from '../types';
import { Field, styles } from '../ui';

/** Reanimated class components disagree with RN JSX element typing under TS 5.x. */
const AnimatedView = Animated.View as unknown as typeof View;

export function OperatorScreen({ token }: { token: string }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [safetyMode, setSafetyMode] = useState('unknown');
  const [height, setHeight] = useState<number | null>(null);
  const scale = useSharedValue(1);

  useEffect(() => {
    let socket: Socket | null = null;
    void (async () => {
      const base = await getApiBase();
      const origin = base.replace(/\/api\/v1$/, '');
      socket = io(`${origin}/realtime`, {
        transports: ['websocket'],
        path: '/socket.io',
      });
      socket.on('safety.state', (s: { mode: string }) => setSafetyMode(s.mode));
      socket.on('tags.update', (t: { hoistHeightMm: number }) =>
        setHeight(t.hoistHeightMm),
      );
    })();
    return () => {
      socket?.disconnect();
    };
  }, []);

  const layoutQuery = useQuery({
    queryKey: ['layout', token],
    queryFn: () => apiGet<Layout>('/hmi/layout', token),
  });

  const pulseDeadman = useCallback(() => {
    void apiPost('/safety/deadman/pulse', undefined, token);
  }, [token]);

  const pressCell = async (cell: Cell) => {
    setError(null);
    try {
      if (cell.isMotion) {
        pulseDeadman();
        setHoldingId(cell.id);
        scale.value = withSpring(0.96);
      }
      await apiPost(
        `/hmi/cells/${cell.id}/activate`,
        {
          value: true,
          safeActionPin: cell.requiresSafeAction ? pin || undefined : undefined,
        },
        token,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activate failed');
      setHoldingId(null);
    }
  };

  const releaseCell = async (cell: Cell) => {
    if (!cell.isMotion) return;
    try {
      await apiPost(`/hmi/cells/${cell.id}/activate`, { value: false }, token);
    } finally {
      setHoldingId(null);
      scale.value = withSpring(1);
      void apiPost('/safety/deadman/release', undefined, token);
    }
  };

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

  const holdStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.banner}>
        Safety: {safetyMode} · H {height ?? '—'} mm
        {holdingId ? ' · DEADMAN' : ''}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Field label="SAFE_ACTION_PIN" value={pin} onChangeText={setPin} secure />
      <Text style={styles.hint}>
        STOP sends this pin. This demo uses the admin password:
        change-me-admin-password
      </Text>
      <AnimatedView style={[styles.matrix, holdStyle]}>
        {grid &&
          grid.cells.map((cell, idx) => {
            const cellWidth: DimensionValue =
              grid.cols > 0
                ? (`${Math.floor(100 / grid.cols) - 2}%` as DimensionValue)
                : '31%';
            return cell ? (
              <Pressable
                key={cell.id}
                style={[
                  styles.cell,
                  { width: cellWidth },
                  cell.style === 'estop' && styles.estop,
                  holdingId === cell.id && styles.holding,
                ]}
                onPressIn={() => void pressCell(cell)}
                onPressOut={() => void releaseCell(cell)}
              >
                <Text style={styles.cellText}>{cell.label}</Text>
              </Pressable>
            ) : (
              <View
                key={`e-${idx}`}
                style={[styles.empty, { width: cellWidth }]}
              />
            );
          })}
      </AnimatedView>
      <Text style={styles.hint}>
        Hold motion cells for deadman. Release to stop.
      </Text>
    </ScrollView>
  );
}
