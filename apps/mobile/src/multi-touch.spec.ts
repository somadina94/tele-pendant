import { describe, expect, it } from '@jest/globals';
import { syncFingers, touchesStillDown, type Finger } from './multi-touch';

describe('syncFingers', () => {
  const hit = (x: number, y: number) => {
    if (x < 50 && y < 40) return 'enable';
    if (x >= 50 && y < 40) return 'jog';
    return null;
  };

  it('keeps Enable held while a second finger presses a rocker', () => {
    const fingers = new Map<number, Finger>();
    const first = syncFingers(fingers, [{ id: 1, x: 10, y: 10 }], hit);
    expect(first).toEqual({ press: ['enable'], release: [] });

    const second = syncFingers(
      fingers,
      [
        { id: 1, x: 10, y: 10 },
        { id: 2, x: 70, y: 10 },
      ],
      hit,
    );
    expect(second).toEqual({ press: ['jog'], release: [] });

    const liftJog = syncFingers(fingers, [{ id: 1, x: 11, y: 10 }], hit);
    expect(liftJog).toEqual({ press: [], release: ['jog'] });
    expect(fingers.get(1)?.key).toBe('enable');
  });

  it('treats a moving finger as a scroll and does not press buttons under it', () => {
    const fingers = new Map<number, Finger>();
    syncFingers(fingers, [{ id: 1, x: 10, y: 10 }], hit);
    const moved = syncFingers(fingers, [{ id: 1, x: 10, y: 40 }], hit);
    expect(moved).toEqual({ press: [], release: ['enable'] });
    const slid = syncFingers(fingers, [{ id: 1, x: 80, y: 10 }], hit);
    expect(slid).toEqual({ press: [], release: [] });
    const up = syncFingers(fingers, [], hit);
    expect(up).toEqual({ press: [], release: [] });
  });

  it('releases only the finger a lift event still lists', () => {
    const fingers = new Map<number, Finger>();
    syncFingers(
      fingers,
      [
        { id: 1, x: 10, y: 10 },
        { id: 2, x: 70, y: 10 },
      ],
      hit,
    );
    const still = touchesStillDown(
      [
        { id: 1, x: 10, y: 10 },
        { id: 2, x: 70, y: 10 },
      ],
      [{ id: 2, x: 70, y: 10 }],
    );
    expect(syncFingers(fingers, still, hit)).toEqual({
      press: [],
      release: ['jog'],
    });
    expect(fingers.get(1)?.key).toBe('enable');
  });

  it('ignores a finger that starts on empty space', () => {
    const fingers = new Map<number, Finger>();
    expect(syncFingers(fingers, [{ id: 4, x: 200, y: 200 }], hit)).toEqual({
      press: [],
      release: [],
    });
    expect(syncFingers(fingers, [], hit)).toEqual({
      press: [],
      release: [],
    });
  });
});
