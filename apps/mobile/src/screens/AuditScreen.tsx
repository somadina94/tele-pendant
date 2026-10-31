import { ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api';
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
  const audit = useQuery({
    queryKey: ['audit', token],
    queryFn: () => apiGet<AuditRow[]>('/audit', token),
  });

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.section}>Audit</Text>
      {audit.isError ? (
        <Text style={styles.error}>
          {audit.error instanceof Error ? audit.error.message : 'Audit failed'}
        </Text>
      ) : null}
      {(audit.data ?? []).map((row) => (
        <Text key={row.id} style={styles.hint}>
          {row.userEmail ?? '—'} {row.action} {row.resource ?? '—'} {row.result}{' '}
          {new Date(row.createdAt).toLocaleString()}
        </Text>
      ))}
    </ScrollView>
  );
}
