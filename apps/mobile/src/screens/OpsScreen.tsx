import { ScrollView, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { Check, Pause, RefreshCw } from 'lucide-react-native';
import { apiGet, apiPost } from '../api';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import {
  Btn,
  BtnText,
  ErrorText,
  Hint,
  LinkText,
  Section,
} from '../ui';

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
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-4 pb-12"
    >
      <HelpTip id="tour.ops.diagnostics">
        <>
          <Section>{t('diagnostics')}</Section>
          <Hint>
            PLC connected: {String(plc?.connected ?? '—')} (
            {plc?.label ?? 'n/a'})
          </Hint>
          <Hint>Safety mode: {safety?.mode ?? '—'}</Hint>
          <Hint>Watchdog OK: {String(safety?.watchdogOk ?? '—')}</Hint>
          <Hint>Uptime: {diagnostics.data?.uptimeSec ?? '—'} s</Hint>
          {plc?.lastError ? (
            <ErrorText>Last error: {plc.lastError}</ErrorText>
          ) : null}
        </>
      </HelpTip>
      <HelpTip id="tour.ops.alarms">
        <Section>{t('alarms')}</Section>
      </HelpTip>
      {(alarms.data ?? []).length === 0 ? (
        <Hint>{t('noAlarms')}</Hint>
      ) : null}
      {(alarms.data ?? []).map((alarm) => (
        <HelpTip key={alarm.id} id="tour.ops.ack">
          <View className="mb-2">
            <Hint>
              [{alarm.definition.severity}] {alarm.definition.name} —{' '}
              {alarm.state} (value {alarm.value})
            </Hint>
            {alarm.state === 'active' ? (
              <View className="mt-1 flex-row gap-4">
                <LinkText
                  onPress={() =>
                    void apiPost(
                      `/alarms/${alarm.id}/ack`,
                      undefined,
                      token,
                    ).then(() => alarms.refetch())
                  }
                >
                  <Text className="text-primary">
                    <Check size={12} color="#3D9CFD" /> {t('ack')}
                  </Text>
                </LinkText>
                <LinkText
                  onPress={() =>
                    void apiPost(
                      `/alarms/${alarm.id}/shelve`,
                      undefined,
                      token,
                    ).then(() => alarms.refetch())
                  }
                >
                  <Text className="text-primary">
                    <Pause size={12} color="#3D9CFD" /> {t('shelve')}
                  </Text>
                </LinkText>
              </View>
            ) : null}
          </View>
        </HelpTip>
      ))}
      <HelpTip id="tour.ops.trends">
        <>
          <Section>{t('trends')}</Section>
          {(trendKeys.data ?? []).length === 0 ? (
            <Hint>{t('noSamples')}</Hint>
          ) : null}
          {(trendKeys.data ?? []).map((key) => (
            <TrendChart key={key} token={token} seriesKey={key} />
          ))}
        </>
      </HelpTip>
      <Btn onPress={() => void alarms.refetch()}>
        <RefreshCw size={16} color="#041018" />
        <BtnText>Refresh</BtnText>
      </Btn>
    </ScrollView>
  );
}

function TrendChart({
  token,
  seriesKey,
}: {
  token: string;
  seriesKey: string;
}) {
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
      <Hint>
        {seriesKey}: {t('noSamples')}
      </Hint>
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
      <Hint>
        {seriesKey}: {values[values.length - 1]}
      </Hint>
      <Svg width="100%" height={80} viewBox="0 0 280 80">
        <Polyline
          points={coords}
          fill="none"
          stroke="#7dcea0"
          strokeWidth={2}
        />
      </Svg>
    </>
  );
}
