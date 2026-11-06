import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { CameraAccessAlert, DeviceCameraPanel } from './device-camera-panel';
import { renderWithProviders } from '../test/render';

vi.mock('@/lib/use-device-camera', () => ({
  useDeviceCamera: vi.fn(),
}));

import { useDeviceCamera } from '@/lib/use-device-camera';

describe('DeviceCameraPanel', () => {
  it('renders nothing from the alert helper when there is no error', () => {
    renderWithProviders(
      <CameraAccessAlert
        videoRef={{ current: null }}
        camError={null}
        camRepromptAllowed
        camShowSettingsHint={false}
        camPermissionDenied={false}
        retryCameraAccess={vi.fn()}
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

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

  it('shows permission-denied copy without duplicating the error prefix', () => {
    renderWithProviders(
      <CameraAccessAlert
        videoRef={{ current: null }}
        camError="Camera permission denied"
        camRepromptAllowed={false}
        camShowSettingsHint={false}
        camPermissionDenied
        retryCameraAccess={vi.fn()}
      />,
    );
    expect(
      screen.queryByText(/Camera permission denied\./),
    ).not.toBeInTheDocument();
  });

  it('reloads the page from the alert action', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    renderWithProviders(
      <CameraAccessAlert
        videoRef={{ current: null }}
        camError="Device busy"
        camRepromptAllowed
        camShowSettingsHint={false}
        camPermissionDenied={false}
        retryCameraAccess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload page' }));
    expect(reload).toHaveBeenCalled();
  });

  it('shows settings hint when reprompt is blocked', () => {
    renderWithProviders(
      <CameraAccessAlert
        videoRef={{ current: null }}
        camError="Camera permission denied"
        camRepromptAllowed={false}
        camShowSettingsHint
        camPermissionDenied={false}
        retryCameraAccess={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Reload page' }),
    ).toBeInTheDocument();
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
