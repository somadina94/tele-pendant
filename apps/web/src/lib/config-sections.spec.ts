import { describe, expect, it } from 'vitest';
import { parseConfigSection } from './config-sections';

describe('parseConfigSection', () => {
  it('falls back when section is disallowed', () => {
    const allowed = new Set(['plc', 'registers'] as const);
    expect(parseConfigSection('users', false, allowed)).toBe('plc');
    expect(parseConfigSection('alarms', true, allowed)).toBe('plc');
    expect(parseConfigSection('registers', true, allowed)).toBe('registers');
  });
});
