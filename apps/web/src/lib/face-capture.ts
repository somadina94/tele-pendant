const MAX_SIDE = 320;

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 16 && video.videoHeight > 16 && !video.paused) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const fail = setTimeout(() => {
      cleanup();
      reject(new Error('Camera not ready — allow the preview, then capture'));
    }, 4000);
    const onReady = () => {
      if (video.videoWidth > 16 && video.videoHeight > 16) {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      clearTimeout(fail);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('playing', onReady);
    };
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('playing', onReady);
    void video.play().catch(() => undefined);
    onReady();
  });
}

/** Capture a JPEG data-URL sized for the API skin-gate (~320px). */
export async function captureDataUrl(video: HTMLVideoElement): Promise<string> {
  await waitForVideoFrame(video);
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
  const width = Math.max(32, Math.round(srcW * scale));
  const height = Math.max(32, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');
  // Mirror so the capture matches the selfie preview users see.
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.85);
}
