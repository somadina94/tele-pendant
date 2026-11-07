import * as Haptics from 'expo-haptics';

/**
 * FEAT-A4: Operator feedback — hold start + motion blocked.
 * Best-effort: ignore when haptics unavailable (simulator / permissions).
 */
export async function hapticHoldStart(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // No vibrator / Expo Go quirks — control path must still run.
  }
}

export async function hapticMotionBlocked(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // Same as above.
  }
}

export function isMotionBlockedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /motion blocked/i.test(msg);
}
