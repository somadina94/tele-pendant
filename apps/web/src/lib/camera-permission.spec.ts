import { describe, expect, it } from 'vitest';
import { canRepromptForCamera } from './camera-permission';

describe('canRepromptForCamera', () => {
  it('allows retry for non-permission errors', () => {
    expect(canRepromptForCamera('denied', false)).toBe(true);
  });

  it('allows retry only while the browser can still prompt', () => {
    expect(canRepromptForCamera('prompt', true)).toBe(true);
    expect(canRepromptForCamera('denied', true)).toBe(false);
    expect(canRepromptForCamera('unsupported', true)).toBe(false);
  });
});
