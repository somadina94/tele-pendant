import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { DeviceCameraPanel } from './device-camera-panel';
import { renderWithProviders } from '../test/render';

vi.mock('@/lib/use-device-camera', () => ({
  useDeviceCamera: vi.fn(),
}));

import { useDeviceCamera } from '@/lib/use-device-camera';

describe('DeviceCameraPanel', () => {
  it('shows the camera error alert', () => {
    vi.mocked(useDeviceCamera).mockReturnValue({
      videoRef: { current: null },
      camError: 'Camera blocked',
      camRepromptAllowed: true,
      camShowSettingsHint: false,
      camPermissionDenied: false,
      retryCameraAccess: vi.fn(),
    });
    renderWithProviders(<DeviceCameraPanel />);
    expect(screen.getByText(/Camera blocked/)).toBeInTheDocument();
  });

  it('renders the live video element', () => {
    vi.mocked(useDeviceCamera).mockReturnValue({
      videoRef: { current: null },
      camError: null,
      camRepromptAllowed: true,
      camShowSettingsHint: false,
      camPermissionDenied: false,
      retryCameraAccess: vi.fn(),
    });
    renderWithProviders(<DeviceCameraPanel videoClassName="test-cam" />);
    expect(document.querySelector('video.test-cam')).toBeTruthy();
  });
});
