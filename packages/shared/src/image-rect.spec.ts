import { describe, expect, it } from 'vitest';
import { containedImageRect, percentInRect } from './image-rect';

describe('containedImageRect', () => {
  it('letterboxes a wide image', () => {
    const rect = containedImageRect(200, 100, 400, 100);
    expect(rect).toEqual({ left: 0, top: 25, width: 200, height: 50 });
  });

  it('returns the frame when a size is missing', () => {
    expect(containedImageRect(0, 10, 10, 10)).toEqual({
      left: 0,
      top: 0,
      width: 0,
      height: 10,
    });
    expect(containedImageRect(-1, -1, 0, 0).width).toBe(0);
  });

  it('turns a click inside the drawing into percents', () => {
    const rect = { left: 10, top: 20, width: 100, height: 50 };
    expect(percentInRect(10, 20, rect)).toEqual({ xPct: 10, yPct: 40 });
    expect(percentInRect(-50, 200, rect)).toEqual({ xPct: 0, yPct: 100 });
    expect(
      percentInRect(1, 1, { left: 0, top: 0, width: 0, height: 0 }),
    ).toEqual({ xPct: 0, yPct: 0 });
  });
});
