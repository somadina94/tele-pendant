import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import { Btn, BtnText, Field, Hint, Section, showErrorFrom } from '../ui';

type AuditRow = {
  id: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  action: string;
  resource?: string | null;
  result: string;
  createdAt: string;
};

type AuditListResult = {
  items: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
};

function formatUser(row: AuditRow): string {
  const name = row.userDisplayName?.trim();
  if (name) return name;
  if (row.userEmail) return row.userEmail;
  return '—';
}

function AuditFieldRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-h-[18px] flex-row items-start gap-3">
      <Text className="w-[72px] shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </Text>
      <Text className="flex-1 text-xs leading-[18px] text-foreground">
        {value}
      </Text>
    </View>
  );
}

function AuditListItem({ row }: { row: AuditRow }) {
  return (
    <View className="min-h-[120px] justify-center gap-2 border-b border-border px-3 py-3.5">
      <Text
        className="text-sm font-semibold leading-5 text-foreground"
        numberOfLines={2}
      >
        {formatUser(row)}
      </Text>
      <AuditFieldRow label="Action" value={row.action} />
      <AuditFieldRow label="Resource" value={row.resource?.trim() || '—'} />
      <AuditFieldRow label="Result" value={row.result} />
      <Text className="pt-0.5 text-xs text-muted-foreground">
        {new Date(row.createdAt).toLocaleString()}
      </Text>
    </View>
  );
}

function auditPath(
  page: number,
  pageSize: number,
  from: string,
  to: string,
  user: string,
): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  if (from.trim()) params.set('from', from.trim());
  if (to.trim()) params.set('to', to.trim());
  if (user.trim()) params.set('user', user.trim());
  return `/audit?${params.toString()}`;
}

export function AuditScreen({ token }: { token: string }) {
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [user, setUser] = useState('');

  const audit = useQuery({
    queryKey: ['audit', token, page, from, to, user],
    queryFn: () =>
      apiGet<AuditListResult>(auditPath(page, pageSize, from, to, user), token),
  });

  const total = audit.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = audit.data?.items ?? [];
  const reportedAuditError = useRef(false);

  useEffect(() => {
    if (audit.isError && !reportedAuditError.current) {
      reportedAuditError.current = true;
      showErrorFrom(audit.error, t('auditFailed'));
    }
    if (!audit.isError) {
      reportedAuditError.current = false;
    }
  }, [audit.error, audit.isError, t]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 p-4 pb-12"
    >
      <HelpTip id="tour.audit.title">
        <Section>{t('auditTitle')}</Section>
      </HelpTip>
      <Hint>
        Filter by date (YYYY-MM-DD), user name or email. Export CSV on web.
      </Hint>
      <Field
        label="From (YYYY-MM-DD)"
        value={from}
        onChangeText={(text) => {
          setFrom(text);
          setPage(1);
        }}
      />
      <Field
        label="To (YYYY-MM-DD)"
        value={to}
        onChangeText={(text) => {
          setTo(text);
          setPage(1);
        }}
      />
      <Field
        label="User"
        value={user}
        onChangeText={(text) => {
          setUser(text);
          setPage(1);
        }}
      />
      <Hint>
        {total === 0
          ? 'No entries'
          : `Page ${page} of ${totalPages} (${total} total)`}
      </Hint>
      <HelpTip id="tour.audit.list">
        <View className="overflow-hidden rounded-xl border border-border bg-card">
          {rows.length === 0 ? (
            <Text className="px-3 py-4 text-sm text-muted-foreground">
              No audit entries match these filters.
            </Text>
          ) : (
            rows.map((row) => <AuditListItem key={row.id} row={row} />)
          )}
        </View>
      </HelpTip>
      {totalPages > 1 ? (
        <View className="flex-row gap-2">
          <Btn
            disabled={page <= 1}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            className="mt-0 flex-1"
          >
            <BtnText>Previous</BtnText>
          </Btn>
          <Btn
            disabled={page >= totalPages}
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="mt-0 flex-1"
          >
            <BtnText>Next</BtnText>
          </Btn>
        </View>
      ) : null}
    </ScrollView>
  );
}
