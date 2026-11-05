import { useEffect, useRef, useState } from 'react';
import {
  describeCameraAccessError,
  isCameraPermissionDenied,
} from '@/lib/camera-error';
import {
  canRepromptForCamera,
  queryCameraPermissionState,
  watchCameraPermission,
  type CameraPermissionState,
} from '@/lib/camera-permission';

export type UseDeviceCameraOptions = {
  enabled?: boolean;
  facingMode?: 'user' | 'environment';
};

export function useDeviceCamera({
  enabled = true,
  facingMode = 'environment',
}: UseDeviceCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [camAttempt, setCamAttempt] = useState(0);
  const [camPermState, setCamPermState] =
    useState<CameraPermissionState>('unsupported');
  const [camPermissionDenied, setCamPermissionDenied] = useState(false);

  function retryCameraAccess() {
    setCamError(null);
    setCamPermissionDenied(false);
    setCamAttempt((n) => n + 1);
  }

  useEffect(() => watchCameraPermission(setCamPermState), []);

  useEffect(() => {
    if (camPermState === 'granted' && camPermissionDenied) {
      retryCameraAccess();
    }
  }, [camPermState, camPermissionDenied]);

  useEffect(() => {
    if (!enabled) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCamError(null);
    setCamPermissionDenied(false);
    void navigator.mediaDevices
      .getUserMedia({
        video: { facingMode },
        audio: false,
      })
      .then((next) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        if (videoRef.current) videoRef.current.srcObject = next;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCamError(describeCameraAccessError(err));
        if (isCameraPermissionDenied(err)) {
          setCamPermissionDenied(true);
          void queryCameraPermissionState().then(setCamPermState);
        }
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [enabled, facingMode, camAttempt]);

  const camRepromptAllowed = canRepromptForCamera(
    camPermState,
    camPermissionDenied,
  );
  const camShowSettingsHint = camPermissionDenied && !camRepromptAllowed;

  return {
    videoRef,
    camError,
    camRepromptAllowed,
    camShowSettingsHint,
    camPermissionDenied,
    retryCameraAccess,
  };
}
