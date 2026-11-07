import { describe, expect, it } from 'vitest';
import {
  normalizeAlarmSeverity,
  tryParseAlarmSeverity,
} from './alarm-severity';

describe('tryParseAlarmSeverity', () => {
  it('accepts defined levels', () => {
    expect(tryParseAlarmSeverity('info')).toEqual({ ok: true, value: 'info' });
    expect(tryParseAlarmSeverity('warning')).toEqual({
      ok: true,
      value: 'warning',
    });
    expect(tryParseAlarmSeverity('critical')).toEqual({
      ok: true,
      value: 'critical',
    });
  });

  it('maps legacy warn and empty to warning', () => {
    expect(tryParseAlarmSeverity('warn')).toEqual({
      ok: true,
      value: 'warning',
    });
    expect(tryParseAlarmSeverity('')).toEqual({ ok: true, value: 'warning' });
    expect(tryParseAlarmSeverity('  ')).toEqual({
      ok: true,
      value: 'warning',
    });
    expect(tryParseAlarmSeverity(undefined)).toEqual({
      ok: true,
      value: 'warning',
    });
  });

  it('rejects unknown free text', () => {
    expect(tryParseAlarmSeverity('urgent')).toEqual({
      ok: false,
      raw: 'urgent',
    });
    expect(tryParseAlarmSeverity('major')).toEqual({
      ok: false,
      raw: 'major',
    });
  });
});

describe('normalizeAlarmSeverity', () => {
  it('accepts defined levels', () => {
    expect(normalizeAlarmSeverity('info')).toBe('info');
    expect(normalizeAlarmSeverity('warning')).toBe('warning');
    expect(normalizeAlarmSeverity('critical')).toBe('critical');
  });

  it('maps legacy warn and empty to warning', () => {
    expect(normalizeAlarmSeverity('warn')).toBe('warning');
    expect(normalizeAlarmSeverity('')).toBe('warning');
    expect(normalizeAlarmSeverity(undefined)).toBe('warning');
  });

  it('coerces unknown free text for read/display', () => {
    expect(normalizeAlarmSeverity('major')).toBe('warning');
    expect(normalizeAlarmSeverity('urgent')).toBe('warning');
  });
});
