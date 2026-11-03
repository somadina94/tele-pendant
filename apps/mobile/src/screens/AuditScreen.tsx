import { ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import { ErrorText, Hint, Section } from '../ui';

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
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-4 pb-12"
    >
      <HelpTip id="tour.audit.title">
        <Section>{t('auditTitle')}</Section>
      </HelpTip>
      {audit.isError ? (
        <ErrorText>
          {audit.error instanceof Error
            ? audit.error.message
            : t('auditFailed')}
        </ErrorText>
      ) : null}
      <HelpTip id="tour.audit.list">
        <>
          {(audit.data ?? []).map((row) => (
            <Hint key={row.id}>
              {row.userEmail ?? '—'} {row.action} {row.resource ?? '—'}{' '}
              {row.result} {new Date(row.createdAt).toLocaleString()}
            </Hint>
          ))}
        </>
      </HelpTip>
    </ScrollView>
  );
}
