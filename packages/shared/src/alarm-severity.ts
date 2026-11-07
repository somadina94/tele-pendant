export const ALARM_SEVERITIES = ['info', 'warning', 'critical'] as const;

export type AlarmSeverity = (typeof ALARM_SEVERITIES)[number];

export const DEFAULT_ALARM_SEVERITY: AlarmSeverity = 'warning';

export type AlarmSeverityParseResult =
  { ok: true; value: AlarmSeverity } | { ok: false; raw: string };

/**
 * Write-path parse: omit/blank → default; warn → warning; unknown → fail.
 * Use for create/update so free-text like "urgent" is not silently coerced.
 */
export function tryParseAlarmSeverity(
  value: string | undefined | null,
): AlarmSeverityParseResult {
  const raw = (value ?? '').trim();
  const v = raw.toLowerCase();
  if (!v) return { ok: true, value: DEFAULT_ALARM_SEVERITY };
  if (v === 'warn') return { ok: true, value: 'warning' };
  if (ALARM_SEVERITIES.includes(v as AlarmSeverity)) {
    return { ok: true, value: v as AlarmSeverity };
  }
  return { ok: false, raw };
}

/** Read-path normalize for display / legacy rows (unknown → warning). */
export function normalizeAlarmSeverity(
  value: string | undefined | null,
): AlarmSeverity {
  const parsed = tryParseAlarmSeverity(value);
  return parsed.ok ? parsed.value : DEFAULT_ALARM_SEVERITY;
}

export function alarmSeveritySelectOptions(): {
  value: AlarmSeverity;
  label: string;
}[] {
  return ALARM_SEVERITIES.map((value) => ({ value, label: value }));
}
