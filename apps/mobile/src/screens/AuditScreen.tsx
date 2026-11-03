import { ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import { styles } from '../ui';

type AuditRow = {
  id: string;
  userEmail?: string | null;
  action: string;
  resource?: string | null;
  result: string;
  createdAt: string;
};

export function AuditScreen({ token }: { token: string }) {
  const { t } = useLocale();
  const audit = useQuery({
    queryKey: ['audit', token],
    queryFn: () => apiGet<AuditRow[]>('/audit', token),
  });

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <HelpTip id="tour.audit.title">
        <Text style={styles.section}>{t('auditTitle')}</Text>
      </HelpTip>
      {audit.isError ? (
        <Text style={styles.error}>
          {audit.error instanceof Error
            ? audit.error.message
            : t('auditFailed')}
        </Text>
      ) : null}
      <HelpTip id="tour.audit.list">
        <>
          {(audit.data ?? []).map((row) => (
            <Text key={row.id} style={styles.hint}>
              {row.userEmail ?? '—'} {row.action} {row.resource ?? '—'}{' '}
              {row.result} {new Date(row.createdAt).toLocaleString()}
            </Text>
          ))}
        </>
      </HelpTip>
    </ScrollView>
  );
}
