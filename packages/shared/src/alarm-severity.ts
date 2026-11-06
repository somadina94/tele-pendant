export const ALARM_SEVERITIES = ['info', 'warning', 'critical'] as const;

export type AlarmSeverity = (typeof ALARM_SEVERITIES)[number];

export const DEFAULT_ALARM_SEVERITY: AlarmSeverity = 'warning';

export function normalizeAlarmSeverity(
  value: string | undefined | null,
): AlarmSeverity {
  const v = value?.trim().toLowerCase();
  if (ALARM_SEVERITIES.includes(v as AlarmSeverity)) {
    return v as AlarmSeverity;
  }
  if (v === 'warn') {
    return 'warning';
  }
  return DEFAULT_ALARM_SEVERITY;
}

export function alarmSeveritySelectOptions(): { value: AlarmSeverity; label: string }[] {
  return ALARM_SEVERITIES.map((value) => ({ value, label: value }));
}
