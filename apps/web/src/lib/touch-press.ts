/** A finger must move this far before iOS Safari is allowed to scroll. */
export const TOUCH_SCROLL_SLOP_PX = 12;
/** Still fingers become a hold. A quicker lift is a tap. */
export const TOUCH_PRESS_DELAY_MS = 120;

export type TouchArm = {
  x: number;
  y: number;
  scrolling: boolean;
  pressed: boolean;
  timer: number;
};

export function isTouchPointer(pointerType: string): boolean {
  return pointerType === 'touch';
}

/**
 * Arm a touch. Do not preventDefault and do not capture yet — iPhone Safari
 * will not scroll the matrix if the button takes the gesture on contact.
 */
export function armTouchPress(
  arms: Map<number, TouchArm>,
  pointerId: number,
  x: number,
  y: number,
  commit: () => void,
  capture: () => void,
): void {
  const arm: TouchArm = {
    x,
    y,
    scrolling: false,
    pressed: false,
    timer: window.setTimeout(() => {
      const current = arms.get(pointerId);
      if (!current || current.scrolling || current.pressed) return;
      current.pressed = true;
      capture();
      commit();
    }, TOUCH_PRESS_DELAY_MS),
  };
  arms.set(pointerId, arm);
}

/** True when this touch is a scroll and the cell should not stay held. */
export function noteTouchScroll(
  arms: Map<number, TouchArm>,
  pointerId: number,
  x: number,
  y: number,
): boolean {
  const arm = arms.get(pointerId);
  if (!arm) return false;
  if (arm.scrolling) return true;
  const dx = x - arm.x;
  const dy = y - arm.y;
  if (dx * dx + dy * dy <= TOUCH_SCROLL_SLOP_PX * TOUCH_SCROLL_SLOP_PX) {
    return false;
  }
  arm.scrolling = true;
  window.clearTimeout(arm.timer);
  return true;
}

export type TouchSettle = 'tap' | 'release' | 'none';

export function settleTouchPress(
  arms: Map<number, TouchArm>,
  pointerId: number,
  kind: 'up' | 'cancel',
): TouchSettle {
  const arm = arms.get(pointerId);
  if (!arm) return 'none';
  window.clearTimeout(arm.timer);
  arms.delete(pointerId);
  if (arm.scrolling || (kind === 'cancel' && !arm.pressed)) return 'none';
  if (!arm.pressed) return 'tap';
  return 'release';
}

export function clearTouchArms(arms: Map<number, TouchArm>): void {
  for (const arm of arms.values()) window.clearTimeout(arm.timer);
  arms.clear();
}
