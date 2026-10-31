import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type DimensionValue,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

/** Reanimated class components disagree with RN JSX element typing under TS 5.x. */
const AnimatedView = Animated.View as unknown as typeof View;
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { apiGet, apiPost, getApiBase } from './src/api';

const queryClient = new QueryClient();

type Cell = {
  id: string;
  row: number;
  col: number;
  label: string;
  style: string;
  isMotion: boolean;
  requiresSafeAction: boolean;
};

type Layout = {
  matrix: { rows: number; cols: number };
  cells: Cell[];
  safety: { mode: string; deadmanActive: boolean };
};

function Pendant() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('change-me-admin-password');
  const [apiBase, setApiBase] = useState('http://127.0.0.1:3010/api/v1');
  const [error, setError] = useState<string | null>(null);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [safetyMode, setSafetyMode] = useState('unknown');
  const [height, setHeight] = useState<number | null>(null);
  const scale = useSharedValue(1);

  useEffect(() => {
    void (async () => {
      const t = await AsyncStorage.getItem('accessToken');
      const base = await getApiBase();
      setApiBase(base);
      if (t) setToken(t);
    })();
  }, []);

  useEffect(() => {
    if (!token) return;
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
  }, [token]);

  const layoutQuery = useQuery({
    queryKey: ['layout', token],
    enabled: Boolean(token),
    queryFn: () => apiGet<Layout>('/hmi/layout', token!),
  });

  const login = async () => {
    setError(null);
    try {
      await AsyncStorage.setItem('apiBase', apiBase);
      const data = await apiPost<{ accessToken: string }>('/auth/login', {
        email,
        password,
      });
      await AsyncStorage.setItem('accessToken', data.accessToken);
      setToken(data.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('accessToken');
    setToken(null);
  };

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
          safeActionPin: cell.requiresSafeAction ? password : undefined,
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

  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Tele-Pendant</Text>
        <Text style={styles.sub}>
          Expo handheld · set API base for device/LAN
        </Text>
        <TextInput
          style={styles.input}
          value={apiBase}
          onChangeText={setApiBase}
          autoCapitalize="none"
          placeholder="API base"
        />
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.btn} onPress={() => void login()}>
          <Text style={styles.btnText}>Sign in</Text>
        </Pressable>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.titleSmall}>Tele-Pendant</Text>
        <Pressable onPress={() => void logout()}>
          <Text style={styles.link}>Logout</Text>
        </Pressable>
      </View>
      <Text style={styles.banner}>
        Safety: {safetyMode} · H {height ?? '—'} mm
        {holdingId ? ' · DEADMAN' : ''}
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <ScrollView contentContainerStyle={styles.scroll}>
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
          Hold motion cells for deadman. OTA: configure expo-updates URL on VPS
          (self-hosted).
        </Text>
      </ScrollView>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pendant />
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1419',
    padding: 16,
  },
  scroll: { paddingBottom: 40 },
  title: {
    color: '#E8EEF4',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 24,
  },
  titleSmall: { color: '#E8EEF4', fontSize: 22, fontWeight: '700' },
  sub: { color: '#8B9AAB', marginBottom: 16 },
  input: {
    backgroundColor: '#161D27',
    borderColor: '#2A3A4D',
    borderWidth: 1,
    borderRadius: 8,
    color: '#E8EEF4',
    padding: 12,
    marginBottom: 10,
  },
  btn: {
    backgroundColor: '#3D9CFD',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  btnText: { color: '#041018', fontWeight: '700' },
  error: { color: '#FF5C5C', marginVertical: 8 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  link: { color: '#3D9CFD' },
  banner: {
    color: '#8B9AAB',
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A3A4D',
  },
  matrix: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cell: {
    width: '31%',
    minHeight: 88,
    backgroundColor: '#1C3A5C',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2F6AA8',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  estop: { backgroundColor: '#5A1D1D', borderColor: '#C44' },
  holding: { borderColor: '#3DD68C', borderWidth: 2 },
  cellText: { color: '#E8EEF4', fontWeight: '700', textAlign: 'center' },
  empty: { width: '31%', minHeight: 88 },
  hint: { color: '#8B9AAB', marginTop: 16, fontSize: 12 },
});
