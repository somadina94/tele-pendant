import { Pressable, ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api';
import { styles } from '../ui';

type Alarm = {
  id: string;
  state: string;
  value: number;
  definition: { name: string; severity: string };
};

type TrendPoint = { value: number; createdAt: string };

type Diagnostics = {
  plc: { connected: boolean; label: string | null; lastError: string | null };
  safety: { mode: string; watchdogOk: boolean };
  uptimeSec: number;
};

export function OpsScreen({ token }: { token: string }) {
  const alarms = useQuery({
    queryKey: ['alarms', token],
    queryFn: () => apiGet<Alarm[]>('/alarms', token),
    refetchInterval: 2000,
  });
  const trends = useQuery({
    queryKey: ['trends', token],
    queryFn: () =>
      apiGet<TrendPoint[]>('/trends/hoistHeightMm?minutes=30', token),
    refetchInterval: 3000,
  });
  const diagnostics = useQuery({
    queryKey: ['diagnostics', token],
    queryFn: () => apiGet<Diagnostics>('/diagnostics', token),
    refetchInterval: 2000,
  });
  const plc = diagnostics.data?.plc;
  const safety = diagnostics.data?.safety;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.section}>Diagnostics</Text>
      <Text style={styles.hint}>
        PLC connected: {String(plc?.connected ?? '—')} ({plc?.label ?? 'n/a'})
      </Text>
      <Text style={styles.hint}>Safety mode: {safety?.mode ?? '—'}</Text>
      <Text style={styles.hint}>
        Watchdog OK: {String(safety?.watchdogOk ?? '—')}
      </Text>
      <Text style={styles.hint}>
        Uptime: {diagnostics.data?.uptimeSec ?? '—'} s
      </Text>
      {plc?.lastError ? (
        <Text style={styles.error}>Last error: {plc.lastError}</Text>
      ) : null}
      <Text style={styles.section}>Alarms</Text>
      {(alarms.data ?? []).length === 0 ? (
        <Text style={styles.hint}>No active alarms</Text>
      ) : null}
      {(alarms.data ?? []).map((alarm) => (
        <Text key={alarm.id} style={styles.hint}>
          [{alarm.definition.severity}] {alarm.definition.name} — {alarm.state}{' '}
          (value {alarm.value})
          {alarm.state === 'active' ? (
            <>
              {' '}
              <Text
                style={styles.link}
                onPress={() =>
                  void apiPost(
                    `/alarms/${alarm.id}/ack`,
                    undefined,
                    token,
                  ).then(() => alarms.refetch())
                }
              >
                Ack
              </Text>
              {'  '}
              <Text
                style={styles.link}
                onPress={() =>
                  void apiPost(
                    `/alarms/${alarm.id}/shelve`,
                    undefined,
                    token,
                  ).then(() => alarms.refetch())
                }
              >
                Shelve
              </Text>
            </>
          ) : null}
        </Text>
      ))}
      <Text style={styles.section}>Trend: hoist height (recent)</Text>
      {(trends.data ?? []).slice(-12).map((point, index) => (
        <Text key={`${point.createdAt}-${index}`} style={styles.hint}>
          {new Date(point.createdAt).toLocaleTimeString()} — {point.value} mm
        </Text>
      ))}
      {(trends.data ?? []).length === 0 ? (
        <Text style={styles.hint}>No samples yet</Text>
      ) : null}
      <Pressable style={styles.btn} onPress={() => void alarms.refetch()}>
        <Text style={styles.btnText}>Refresh</Text>
      </Pressable>
    </ScrollView>
  );
}
