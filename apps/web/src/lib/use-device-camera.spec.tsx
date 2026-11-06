import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { queryCameraPermissionState } from '@/lib/camera-permission';
import { useDeviceCamera } from './use-device-camera';

const permissionState = vi.hoisted(() => ({
  value: 'denied' as string,
  cb: null as ((s: string) => void) | null,
}));
vi.mock('@/lib/camera-permission', () => ({
  queryCameraPermissionState: vi.fn().mockResolvedValue('denied'),
  watchCameraPermission: vi.fn((cb: (s: string) => void) => {
    permissionState.cb = cb;
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

  it('retries automatically when permission flips to granted', async () => {
    permissionState.value = 'denied';
    const denied = Object.assign(new Error('denied'), {
      name: 'NotAllowedError',
    });
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(denied)
      .mockResolvedValueOnce({ getTracks: () => [{ stop: vi.fn() }] });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.mocked(queryCameraPermissionState).mockResolvedValue('denied');
    renderHook(() => useDeviceCamera({ enabled: true }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    permissionState.cb?.('granted');
    await waitFor(() =>
      expect(getUserMedia.mock.calls.length).toBeGreaterThan(1),
    );
  });
});
