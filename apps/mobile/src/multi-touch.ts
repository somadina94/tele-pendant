export type Finger = {
  key: string | null;
  scrolling: boolean;
  originX: number;
  originY: number;
};

export const TOUCH_SCROLL_SLOP_PX = 12;

export type TouchPoint = { id: number; x: number; y: number };

/**
 * Gesture Handler's lift and cancel events still list the finger that just
 * left in `allTouches`. Drop those ids so only the fingers still down remain.
 */
export function touchesStillDown(
  all: TouchPoint[],
  lifted: TouchPoint[],
): TouchPoint[] {
  if (lifted.length === 0) return all;
  const liftedIds = new Set(lifted.map((touch) => touch.id));
  return all.filter((touch) => !liftedIds.has(touch.id));
}

/**
 * Track every finger. A still finger presses its button. A moving finger
 * scrolls and does not press the buttons it slides across. Lifting a finger
 * releases only that finger's button, so Enable can stay down while another
 * finger uses a rocker.
 */
export function syncFingers(
  fingers: Map<number, Finger>,
  touches: TouchPoint[],
  hit: (x: number, y: number) => string | null,
): { press: string[]; release: string[] } {
  const press: string[] = [];
  const release: string[] = [];
  const seen = new Set<number>();

  for (const touch of touches) {
    seen.add(touch.id);
    const prev = fingers.get(touch.id);
    if (!prev) {
      const key = hit(touch.x, touch.y);
      fingers.set(touch.id, {
        key,
        scrolling: false,
        originX: touch.x,
        originY: touch.y,
      });
      if (key) press.push(key);
      continue;
    }
    if (prev.scrolling) continue;
    const dx = touch.x - prev.originX;
    const dy = touch.y - prev.originY;
    if (dx * dx + dy * dy <= TOUCH_SCROLL_SLOP_PX * TOUCH_SCROLL_SLOP_PX) {
      continue;
    }
    prev.scrolling = true;
    if (prev.key) release.push(prev.key);
    prev.key = null;
  }

  for (const [id, finger] of fingers) {
    if (seen.has(id)) continue;
    if (finger.key) release.push(finger.key);
    fingers.delete(id);
  }

  return { press, release };
}
