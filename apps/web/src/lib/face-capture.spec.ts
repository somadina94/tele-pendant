import { describe, expect, it, vi } from 'vitest';
import { captureDataUrl } from './face-capture';

describe('captureDataUrl', () => {
  it('captures jpeg data url and rejects missing context', async () => {
    const video = {
      videoWidth: 10,
      videoHeight: 10,
    } as HTMLVideoElement;
    const drawImage = vi.fn();
    const toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,xx');
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL,
    } as unknown as HTMLCanvasElement);
    await expect(captureDataUrl(video)).resolves.toBe(
      'data:image/jpeg;base64,xx',
    );

    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => null,
      toDataURL,
    } as unknown as HTMLCanvasElement);
    await expect(
      captureDataUrl({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement),
    ).rejects.toThrow('Canvas unsupported');
  });
});
