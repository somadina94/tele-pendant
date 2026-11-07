import { describe, expect, it } from 'vitest';
import {
  isClusterMetricRegister,
  tagValueForRegister,
  type TagSnapshot,
} from './tags';

const tags: TagSnapshot = {
  hoistHeightMm: 1250,
  loadKg: 0,
  speedPct: 70,
  trolleyPositionMm: 420,
  motorRunning: true,
};

describe('tagValueForRegister', () => {
  it('maps trolley position for cell status badges (TP-15)', () => {
    expect(tagValueForRegister(tags, 'holding.trolleyPosition')).toBe(420);
    expect(
      tagValueForRegister(
        { ...tags, trolleyPositionMm: undefined, values: undefined },
        'holding.trolleyPosition',
      ),
    ).toBe('—');
    expect(
      tagValueForRegister(
        {
          ...tags,
          values: { 'holding.trolleyPosition': 88 },
        },
        'holding.trolleyPosition',
      ),
    ).toBe(88);
  });

  it('maps motor run/idle for trolley feedback', () => {
    expect(tagValueForRegister(tags, 'discrete.motorRunning')).toBe('RUN');
    expect(
      tagValueForRegister(
        { ...tags, motorRunning: false },
        'discrete.motorRunning',
      ),
    ).toBe('IDLE');
  });
});

describe('isClusterMetricRegister', () => {
  it('treats trolley position as a cluster metric', () => {
    expect(isClusterMetricRegister('holding.trolleyPosition')).toBe(true);
    expect(isClusterMetricRegister('holding.speedPct')).toBe(false);
  });
});
