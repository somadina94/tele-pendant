import { useT } from '@/lib/i18n';
import { useDeviceCamera, type UseDeviceCameraOptions } from '@/lib/use-device-camera';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CameraAccessState = ReturnType<typeof useDeviceCamera>;

export function CameraAccessAlert({
  camError,
  camShowSettingsHint,
  camPermissionDenied,
}: CameraAccessState) {
  const { t } = useT();
  if (!camError) return null;

  const permissionCopy =
    camShowSettingsHint || camPermissionDenied
      ? t('cameraPermissionSettingsHint')
      : t('cameraPermissionDenied');

  return (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {!camPermissionDenied && camError !== 'Camera permission denied'
            ? `${camError}. `
            : null}
          {permissionCopy}
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={() => window.location.reload()}
        >
          {t('reloadPage')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

type DeviceCameraPanelProps = UseDeviceCameraOptions & {
  videoClassName?: string;
};

export function DeviceCameraPanel({
  enabled = true,
  facingMode = 'environment',
  videoClassName,
}: DeviceCameraPanelProps) {
  const camera = useDeviceCamera({ enabled, facingMode });

  if (camera.camError) {
    return <CameraAccessAlert {...camera} />;
  }

  return (
    <video
      ref={camera.videoRef}
      className={cn(
        'aspect-video w-full rounded-md border bg-black object-cover',
        videoClassName,
      )}
      autoPlay
      playsInline
      muted
    />
  );
}
