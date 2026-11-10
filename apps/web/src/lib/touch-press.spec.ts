import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TOUCH_PRESS_DELAY_MS,
  armTouchPress,
  clearTouchArms,
  isTouchPointer,
  noteTouchScroll,
  settleTouchPress,
  type TouchArm,
} from './touch-press';

describe('touch press vs scroll', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats only real touch pointers as touch', () => {
    expect(isTouchPointer('touch')).toBe(true);
    expect(isTouchPointer('mouse')).toBe(false);
    expect(isTouchPointer('')).toBe(false);
  });

  it('commits a still finger and ignores a late timer', () => {
    vi.useFakeTimers();
    const arms = new Map<number, TouchArm>();
    const commit = vi.fn();
    const capture = vi.fn();
    armTouchPress(arms, 1, 0, 0, commit, capture);
    vi.advanceTimersByTime(TOUCH_PRESS_DELAY_MS);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(arms.get(1)?.pressed).toBe(true);

    const scrolling = new Map<number, TouchArm>();
    armTouchPress(scrolling, 2, 0, 0, commit, capture);
    scrolling.get(2)!.scrolling = true;
    vi.advanceTimersByTime(TOUCH_PRESS_DELAY_MS);

    const already = new Map<number, TouchArm>();
    armTouchPress(already, 3, 0, 0, commit, capture);
    already.get(3)!.pressed = true;
    vi.advanceTimersByTime(TOUCH_PRESS_DELAY_MS);

    const gone = new Map<number, TouchArm>();
    armTouchPress(gone, 4, 0, 0, commit, capture);
    gone.delete(4);
    vi.advanceTimersByTime(TOUCH_PRESS_DELAY_MS);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('marks a long move as scroll and leaves a short move armed', () => {
    vi.useFakeTimers();
    const arms = new Map<number, TouchArm>();
    armTouchPress(arms, 1, 10, 10, vi.fn(), vi.fn());
    expect(noteTouchScroll(arms, 99, 0, 0)).toBe(false);
    expect(noteTouchScroll(arms, 1, 12, 14)).toBe(false);
    expect(noteTouchScroll(arms, 1, 10, 40)).toBe(true);
    expect(arms.get(1)?.scrolling).toBe(true);
    expect(noteTouchScroll(arms, 1, 10, 80)).toBe(true);
    vi.advanceTimersByTime(TOUCH_PRESS_DELAY_MS);
    expect(arms.get(1)?.pressed).toBe(false);
  });

  it('settles a tap, a hold, a scroll, and a cancel', () => {
    vi.useFakeTimers();
    const arms = new Map<number, TouchArm>();
    expect(settleTouchPress(arms, 1, 'up')).toBe('none');

    armTouchPress(arms, 2, 0, 0, vi.fn(), vi.fn());
    expect(settleTouchPress(arms, 2, 'up')).toBe('tap');

    armTouchPress(arms, 3, 0, 0, vi.fn(), vi.fn());
    noteTouchScroll(arms, 3, 0, 40);
    expect(settleTouchPress(arms, 3, 'up')).toBe('none');

    armTouchPress(arms, 4, 0, 0, vi.fn(), vi.fn());
    expect(settleTouchPress(arms, 4, 'cancel')).toBe('none');

    const commit = vi.fn();
    armTouchPress(arms, 5, 0, 0, commit, vi.fn());
    vi.advanceTimersByTime(TOUCH_PRESS_DELAY_MS);
    expect(settleTouchPress(arms, 5, 'cancel')).toBe('release');
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('clears pending timers', () => {
    vi.useFakeTimers();
    const arms = new Map<number, TouchArm>();
    const commit = vi.fn();
    armTouchPress(arms, 1, 0, 0, commit, vi.fn());
    clearTouchArms(arms);
    vi.advanceTimersByTime(TOUCH_PRESS_DELAY_MS);
    expect(commit).not.toHaveBeenCalled();
    expect(arms.size).toBe(0);
  });
});
