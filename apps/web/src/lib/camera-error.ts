export function isCameraPermissionDenied(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'name' in err) {
    return String((err as { name: string }).name) === 'NotAllowedError';
  }
  return err !== undefined && err !== null && !(err instanceof Error);
}

/** User-facing message for getUserMedia failures. */
export function describeCameraAccessError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const name = String((err as { name: string }).name);
    if (name === 'NotAllowedError') {
      return 'Camera permission denied';
    }
    if (name === 'NotFoundError') {
      return 'No camera found on this device';
    }
    if (name === 'NotReadableError') {
      return 'Camera is in use by another app — close it and try again';
    }
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return 'Camera permission denied';
}
