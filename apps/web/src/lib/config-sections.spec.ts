import { describe, expect, it } from 'vitest';
import { configSectionGroups, parseConfigSection } from './config-sections';

describe('configSectionGroups', () => {
  it('prepends users for admins and filters by allowed ids', () => {
    const all = configSectionGroups(true);
    expect(all[0]?.title).toBe('Administration');
    const filtered = configSectionGroups(true, new Set(['registers', 'codes']));
    expect(filtered.some((g) => g.items.some((i) => i.id === 'users'))).toBe(
      false,
    );
    expect(filtered.flatMap((g) => g.items.map((i) => i.id))).toEqual([
      'registers',
      'codes',
    ]);
  });

  it('returns full groups when no allow-list is passed', () => {
    expect(configSectionGroups(false).some((g) => g.title === 'Plant')).toBe(
      true,
    );
  });
});

describe('parseConfigSection', () => {
  it('falls back when section is disallowed', () => {
    const allowed = new Set(['plc', 'registers'] as const);
    expect(parseConfigSection('users', false, allowed)).toBe('plc');
    expect(parseConfigSection('alarms', true, allowed)).toBe('plc');
    expect(parseConfigSection('registers', true, allowed)).toBe('registers');
  });

  it('returns valid sections when no allow-list is provided', () => {
    expect(parseConfigSection('cells', true)).toBe('cells');
    expect(parseConfigSection(null, false)).toBe('plc');
  });

  it('uses the first allowed section when plc is missing', () => {
    const allowed = new Set(['registers', 'codes'] as const);
    expect(parseConfigSection(null, false, allowed)).toBe('registers');
    expect(parseConfigSection('invalid', false, allowed)).toBe('registers');
  });
});
