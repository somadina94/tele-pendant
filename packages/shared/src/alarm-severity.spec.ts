import { describe, expect, it } from 'vitest';
import { normalizeAlarmSeverity } from './alarm-severity';

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

  it('rejects unknown free text', () => {
    expect(normalizeAlarmSeverity('major')).toBe('warning');
  });
});
