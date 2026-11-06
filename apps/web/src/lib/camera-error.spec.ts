import { describe, expect, it } from 'vitest';
import {
  describeCameraAccessError,
  isCameraPermissionDenied,
} from './camera-error';

describe('camera-error', () => {
  it('detects permission denials', () => {
    expect(isCameraPermissionDenied({ name: 'NotAllowedError' })).toBe(true);
    expect(isCameraPermissionDenied(new Error('x'))).toBe(false);
    expect(isCameraPermissionDenied({ code: 1 })).toBe(true);
  });

  it('maps device errors to messages', () => {
    expect(describeCameraAccessError({ name: 'NotAllowedError' })).toBe(
      'Camera permission denied',
    );
    expect(describeCameraAccessError({ name: 'NotFoundError' })).toMatch(
      /No camera found/,
    );
    expect(describeCameraAccessError({ name: 'NotReadableError' })).toMatch(
      /in use/,
    );
    expect(describeCameraAccessError(new Error('custom'))).toBe('custom');
    expect(describeCameraAccessError({})).toBe('Camera permission denied');
  });
});
