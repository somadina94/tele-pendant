import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDeviceCamera } from './use-device-camera';

const permissionState = vi.hoisted(() => ({ value: 'denied' as string }));
vi.mock('@/lib/camera-permission', () => ({
  queryCameraPermissionState: vi.fn().mockResolvedValue('granted'),
  watchCameraPermission: vi.fn((cb: (s: string) => void) => {
    cb(permissionState.value);
    return () => {};
  }),
  canRepromptForCamera: vi.fn(() => true),
}));

describe('useDeviceCamera', () => {
  it('retries when permission becomes granted after denial', async () => {
    permissionState.value = 'granted';
    const getUserMedia = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    const { result } = renderHook(() => useDeviceCamera({ enabled: true }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    result.current.retryCameraAccess();
    await waitFor(() =>
      expect(getUserMedia.mock.calls.length).toBeGreaterThan(1),
    );
  });
});
