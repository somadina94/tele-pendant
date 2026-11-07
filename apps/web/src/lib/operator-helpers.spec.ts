import { describe, expect, it } from 'vitest';
import { formatOverlay, tagValueForRegister } from './operator-helpers';
import type { LiveTags } from './api';

const tags: LiveTags = {
  hoistHeightMm: 1200,
  loadKg: 40,
  speedPct: 55,
  motorRunning: true,
  fault: false,
  commsOk: true,
  at: new Date().toISOString(),
};

describe('operator helpers', () => {
  it('formats overlay values', () => {
    expect(formatOverlay('{value} mm', 12)).toBe('12 mm');
  });

  it('maps register names to live tags', () => {
    expect(tagValueForRegister(null, 'x')).toBe('—');
    expect(tagValueForRegister(tags, null)).toBe('—');
    expect(tagValueForRegister(tags, 'holding.hoistHeightMm')).toBe(1200);
    expect(tagValueForRegister(tags, 'holding.loadKg')).toBe(40);
    expect(tagValueForRegister(tags, 'discrete.motorRunning')).toBe('RUN');
    expect(
      tagValueForRegister({ ...tags, motorRunning: false }, 'motorRunning'),
    ).toBe('IDLE');
    expect(tagValueForRegister(tags, 'holding.speedPct')).toBe(55);
    expect(
      tagValueForRegister(
        { ...tags, trolleyPositionMm: 90 },
        'holding.trolleyPosition',
      ),
    ).toBe(90);
    expect(tagValueForRegister(tags, 'unknown')).toBe('—');
    expect(
      tagValueForRegister(
        { ...tags, values: { 'coil.eStop': true } },
        'coil.eStop',
      ),
    ).toBe(true);
    expect(
      tagValueForRegister(
        { ...tags, values: { 'discrete.motorRunning': true } },
        'discrete.motorRunning',
      ),
    ).toBe('RUN');
    expect(
      tagValueForRegister(
        { ...tags, values: { 'discrete.motorRunning': false } },
        'discrete.motorRunning',
      ),
    ).toBe('IDLE');
    expect(
      tagValueForRegister({ ...tags, values: {} }, 'holding.hoistHeightMm'),
    ).toBe(1200);
  });
});
