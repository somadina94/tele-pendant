import { Pressable, ScrollView, Text } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api';
import { useLocale } from '../locale';
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
  const { t } = useLocale();
  const alarms = useQuery({
    queryKey: ['alarms', token],
    queryFn: () => apiGet<Alarm[]>('/alarms', token),
    refetchInterval: 2000,
  });
  const trendKeys = useQuery({
    queryKey: ['trend-keys', token],
    queryFn: async () => {
      const rows = await apiGet<unknown>('/trends', token);
      return Array.isArray(rows) ? (rows as string[]) : [];
    },
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
      <Text style={styles.section}>{t('diagnostics')}</Text>
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
      <Text style={styles.section}>{t('alarms')}</Text>
      {(alarms.data ?? []).length === 0 ? (
        <Text style={styles.hint}>{t('noAlarms')}</Text>
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
                {t('ack')}
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
                {t('shelve')}
              </Text>
            </>
          ) : null}
        </Text>
      ))}
      <Text style={styles.section}>{t('trends')}</Text>
      {(trendKeys.data ?? []).length === 0 ? (
        <Text style={styles.hint}>{t('noSamples')}</Text>
      ) : null}
      {(trendKeys.data ?? []).map((key) => (
        <TrendChart key={key} token={token} seriesKey={key} />
      ))}
      <Pressable style={styles.btn} onPress={() => void alarms.refetch()}>
        <Text style={styles.btnText}>Refresh</Text>
      </Pressable>
    </ScrollView>
  );
}

function TrendChart({ token, seriesKey }: { token: string; seriesKey: string }) {
  const { t } = useLocale();
  const query = useQuery({
    queryKey: ['trend', token, seriesKey],
    queryFn: async () => {
      const rows = await apiGet<TrendPoint[]>(
        `/trends/${encodeURIComponent(seriesKey)}?minutes=30`,
        token,
      );
      return Array.isArray(rows) ? rows : [];
    },
  });
  const points = query.data ?? [];
  if (points.length === 0) {
    return (
      <Text style={styles.hint}>
        {seriesKey}: {t('noSamples')}
      </Text>
    );
  }
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const coords = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 280;
      const y = 80 - ((value - min) / span) * 80;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <>
      <Text style={styles.hint}>
        {seriesKey}: {values[values.length - 1]}
      </Text>
      <Svg width="100%" height={80} viewBox="0 0 280 80">
        <Polyline points={coords} fill="none" stroke="#7dcea0" strokeWidth={2} />
      </Svg>
    </>
  );
}
