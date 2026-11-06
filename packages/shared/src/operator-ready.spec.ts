import { describe, expect, it } from 'vitest';
import { isOperatorScreenReady, operatorNeedsLiveTags } from './operator-ready';

describe('operatorNeedsLiveTags', () => {
  it('is false for an empty layout', () => {
    expect(operatorNeedsLiveTags({ cells: [], overlays: [] })).toBe(false);
  });

  it('is true when cells or overlays use registers', () => {
    expect(
      operatorNeedsLiveTags({
        cells: [{ feedbackRegister: { id: '1' } }],
        overlays: [],
      }),
    ).toBe(true);
    expect(
      operatorNeedsLiveTags({
        cells: [],
        overlays: [{ register: { id: '1' } }],
      }),
    ).toBe(true);
  });
});

describe('isOperatorScreenReady', () => {
  it('waits for layout and grid', () => {
    expect(
      isOperatorScreenReady({
        layoutLoaded: false,
        gridReady: false,
        needsLive: false,
        hasTags: false,
        liveFallback: false,
      }),
    ).toBe(false);
    expect(
      isOperatorScreenReady({
        layoutLoaded: true,
        gridReady: true,
        needsLive: false,
        hasTags: false,
        liveFallback: false,
      }),
    ).toBe(true);
  });

  it('waits for tags when live data is required', () => {
    expect(
      isOperatorScreenReady({
        layoutLoaded: true,
        gridReady: true,
        needsLive: true,
        hasTags: false,
        liveFallback: false,
      }),
    ).toBe(false);
    expect(
      isOperatorScreenReady({
        layoutLoaded: true,
        gridReady: true,
        needsLive: true,
        hasTags: true,
        liveFallback: false,
      }),
    ).toBe(true);
    expect(
      isOperatorScreenReady({
        layoutLoaded: true,
        gridReady: true,
        needsLive: true,
        hasTags: false,
        liveFallback: true,
      }),
    ).toBe(true);
  });
});
