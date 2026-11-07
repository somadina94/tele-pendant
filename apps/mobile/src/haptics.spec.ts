jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Error: 'error' },
}));

import * as Haptics from 'expo-haptics';
import {
  hapticHoldStart,
  hapticMotionBlocked,
  isMotionBlockedError,
} from './haptics';

describe('haptics (FEAT-A4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects motion-blocked API messages', () => {
    expect(
      isMotionBlockedError(
        new Error('Motion blocked: hold deadman and ensure normal safety mode'),
      ),
    ).toBe(true);
    expect(isMotionBlockedError(new Error('PIN does not match'))).toBe(false);
    expect(isMotionBlockedError('motion blocked')).toBe(true);
  });

  it('fires hold-start and blocked patterns', async () => {
    await hapticHoldStart();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Medium,
    );
    await hapticMotionBlocked();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Error,
    );
  });

  it('swallows haptic failures so control keeps running', async () => {
    (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(
      new Error('no vibrator'),
    );
    (Haptics.notificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error('no vibrator'),
    );
    await expect(hapticHoldStart()).resolves.toBeUndefined();
    await expect(hapticMotionBlocked()).resolves.toBeUndefined();
  });
});
