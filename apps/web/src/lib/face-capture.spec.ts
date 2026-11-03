import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureDataUrl } from './face-capture';

describe('captureDataUrl', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('captures a downscaled mirrored jpeg when the preview is live', async () => {
    const video = {
      videoWidth: 640,
      videoHeight: 480,
      paused: false,
      play: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;
    const drawImage = vi.fn();
    const translate = vi.fn();
    const scale = vi.fn();
    const toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,xx');
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage, translate, scale }),
      toDataURL,
    } as unknown as HTMLCanvasElement);

    await expect(captureDataUrl(video)).resolves.toBe(
      'data:image/jpeg;base64,xx',
    );
    expect(translate).toHaveBeenCalledWith(320, 0);
    expect(scale).toHaveBeenCalledWith(-1, 1);
    expect(drawImage).toHaveBeenCalled();
  });

  it('rejects when canvas context is missing', async () => {
    const video = {
      videoWidth: 320,
      videoHeight: 240,
      paused: false,
      play: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => null,
      toDataURL: vi.fn(),
    } as unknown as HTMLCanvasElement);
    await expect(captureDataUrl(video)).rejects.toThrow('Canvas unsupported');
  });

  it('rejects when the camera never produces a frame', async () => {
    vi.useFakeTimers();
    const video = {
      videoWidth: 0,
      videoHeight: 0,
      paused: true,
      play: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;
    const pending = expect(captureDataUrl(video)).rejects.toThrow(
      /Camera not ready/,
    );
    await vi.advanceTimersByTimeAsync(4000);
    await pending;
  });

  it('waits for loadeddata before capturing', async () => {
    let width = 0;
    let height = 0;
    const listeners: Record<string, Array<() => void>> = {};
    const video = {
      get videoWidth() {
        return width;
      },
      get videoHeight() {
        return height;
      },
      paused: true,
      play: vi.fn().mockResolvedValue(undefined),
      addEventListener: (event: string, fn: () => void) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event].push(fn);
      },
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;
    const toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,ready');
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
      }),
      toDataURL,
    } as unknown as HTMLCanvasElement);

    const pending = captureDataUrl(video);
    width = 320;
    height = 240;
    for (const fn of listeners.loadeddata ?? []) fn();
    await expect(pending).resolves.toBe('data:image/jpeg;base64,ready');
  });
});
