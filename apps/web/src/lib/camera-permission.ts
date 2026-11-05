export type CameraPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export async function queryCameraPermissionState(): Promise<CameraPermissionState> {
  if (!navigator.permissions?.query) return 'unsupported';
  try {
    const status = await navigator.permissions.query({
      name: 'camera' as PermissionName,
    });
    return status.state as CameraPermissionState;
  } catch {
    return 'unsupported';
  }
}

/** Subscribe to camera permission changes (e.g. after user fixes site settings). */
export function watchCameraPermission(
  onChange: (state: CameraPermissionState) => void,
): () => void {
  let cancelled = false;
  let removeListener: (() => void) | null = null;

  void (async () => {
    if (!navigator.permissions?.query) {
      if (!cancelled) onChange('unsupported');
      return;
    }
    try {
      const status = await navigator.permissions.query({
        name: 'camera' as PermissionName,
      });
      const handler = () => {
        onChange(status.state as CameraPermissionState);
      };
      status.addEventListener('change', handler);
      removeListener = () => status.removeEventListener('change', handler);
      if (!cancelled) onChange(status.state as CameraPermissionState);
    } catch {
      if (!cancelled) onChange('unsupported');
    }
  })();

  return () => {
    cancelled = true;
    removeListener?.();
  };
}

/** True when getUserMedia can still show the browser permission prompt. */
export function canRepromptForCamera(
  permissionState: CameraPermissionState,
  permissionDenied: boolean,
): boolean {
  if (!permissionDenied) return true;
  return permissionState === 'prompt';
}
