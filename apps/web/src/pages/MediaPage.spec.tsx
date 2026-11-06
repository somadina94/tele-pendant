import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MediaPage } from './MediaPage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const zxingState = vi.hoisted(() => ({ mode: 'TP-CRANE-DEMO-01' }));
const cameraOverride = vi.hoisted(() => ({
  impl: null as
    | null
    | (() => ReturnType<
        typeof import('@/lib/use-device-camera').useDeviceCamera
      >),
}));
const toastMocks = vi.hoisted(() => ({
  ok: vi.fn(),
  err: vi.fn(),
}));

vi.mock('@/lib/use-device-camera', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/use-device-camera')>();
  return {
    useDeviceCamera: (opts?: Parameters<typeof actual.useDeviceCamera>[0]) =>
      cameraOverride.impl?.() ?? actual.useDeviceCamera(opts),
  };
});

vi.mock('@/lib/toast', () => ({
  toastOk: (...args: unknown[]) => toastMocks.ok(...args),
  toastErr: (...args: unknown[]) => toastMocks.err(...args),
}));

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    decodeOnceFromVideoElement() {
      if (zxingState.mode === 'throw') throw new Error('decode failed');
      const text = zxingState.mode;
      return Promise.resolve({ getText: () => text });
    }
  },
}));

describe('MediaPage', () => {
  beforeEach(() => {
    cameraOverride.impl = null;
    navigateMock.mockClear();
    zxingState.mode = 'TP-CRANE-DEMO-01';
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
    toastMocks.ok.mockClear();
    toastMocks.err.mockClear();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/media/camera') {
        return {
          deviceCameraEnabled: true,
          rtspUrl: 'rtsp://cam',
          notes: 'Device camera notes',
        };
      }
      return [{ code: 'TP-CRANE-DEMO-01', label: 'Bay', routeHint: '/ops' }];
    });
    vi.spyOn(api, 'apiPost').mockResolvedValue({
      code: 'TP-CRANE-DEMO-01',
      label: 'Bay',
      routeHint: null,
    });
  });

  it('navigates after resolve when a route hint is returned', async () => {
    vi.spyOn(api, 'apiPost').mockResolvedValue({
      code: 'TP-OPS',
      label: 'Ops',
      routeHint: '/ops',
    });
    renderWithProviders(<MediaPage />);
    await screen.findByText(/Device camera notes/);
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/ops'));
  });

  it('rejects whitespace-only scan payloads', async () => {
    class SpaceDetector {
      detect = vi.fn().mockResolvedValue([{ rawValue: '   ' }]);
    }
    (
      window as unknown as { BarcodeDetector: typeof SpaceDetector }
    ).BarcodeDetector = SpaceDetector;
    const post = vi.spyOn(api, 'apiPost');
    renderWithProviders(<MediaPage />);
    await screen.findByText(/Device camera notes/);
    await waitFor(() => expect(document.querySelector('video')).toBeTruthy());
    fireEvent.click(
      screen.getByRole('button', { name: 'Scan QR / barcode in frame' }),
    );
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(
        alerts.some((el) => /Enter a code/i.test(el.textContent ?? '')),
      ).toBe(true);
    });
    expect(post).not.toHaveBeenCalledWith(
      '/media/codes/resolve',
      expect.anything(),
    );
  });

  it('resolves codes and scans barcodes', async () => {
    class FakeDetector {
      detect = vi.fn().mockResolvedValue([{ rawValue: 'TP-CRANE-DEMO-01' }]);
    }
    (
      window as unknown as { BarcodeDetector: typeof FakeDetector }
    ).BarcodeDetector = FakeDetector;

    const post = vi.spyOn(api, 'apiPost').mockImplementation(async (path) => {
      if (path === '/media/codes/resolve') {
        return {
          code: 'TP-CRANE-DEMO-01',
          label: 'Bay',
          routeHint: null,
        };
      }
      return { ok: true, label: 'Hoist Up' };
    });

    renderWithProviders(<MediaPage />);
    expect(await screen.findByText(/Device camera notes/)).toBeInTheDocument();
    expect(screen.getByText(/Plant camera configured/)).toBeInTheDocument();

    const codeInput = screen.getByDisplayValue('TP-CRANE-DEMO-01');
    fireEvent.change(codeInput, { target: { value: 'TP-CUSTOM' } });
    expect(codeInput).toHaveValue('TP-CUSTOM');
    fireEvent.change(codeInput, { target: { value: 'TP-CRANE-DEMO-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/media/codes/resolve', {
        code: 'TP-CRANE-DEMO-01',
      }),
    );
    await waitFor(() => expect(toastMocks.ok).toHaveBeenCalledWith('Bay'));
    expect(
      screen.getAllByText(/Resolved: Bay \(TP-CRANE-DEMO-01\)/).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'TP-CRANE-DEMO-01' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Scan QR / barcode in frame' }),
    );
    await waitFor(() => expect(api.apiPost).toHaveBeenCalled());
  });

  it('handles camera, barcode, voice, and resolve failures', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('no cam')),
      },
    });
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;

    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/media/camera') {
        return {
          deviceCameraEnabled: true,
          rtspUrl: null,
          notes: 'notes',
        };
      }
      return [];
    });
    vi.spyOn(api, 'apiPost').mockRejectedValueOnce(new Error('bad code'));

    renderWithProviders(<MediaPage />);
    expect(await screen.findByText(/no cam/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: ' ' } });
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Code'), {
      target: { value: 'TP-CRANE-DEMO-01' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() =>
      expect(toastMocks.err).toHaveBeenCalledWith('bad code'),
    );
    expect(screen.getAllByText('bad code').length).toBeGreaterThan(0);

    vi.spyOn(api, 'apiPost').mockRejectedValueOnce('x');
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() =>
      expect(toastMocks.err).toHaveBeenCalledWith('Resolve failed'),
    );
    expect(screen.getAllByText('Resolve failed').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    expect(
      await screen.findByText(/SpeechRecognition not supported/),
    ).toBeInTheDocument();
  });

  it('handles non-Error camera denial', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue('denied'),
      },
    });
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/media/camera') {
        return {
          deviceCameraEnabled: true,
          rtspUrl: null,
          notes: 'notes',
        };
      }
      return [];
    });
    renderWithProviders(<MediaPage />);
    expect(
      await screen.findByText(/blocked for this site/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reload page' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Allow camera again' }),
    ).not.toBeInTheDocument();
  });

  it('runs speech recognition success and error paths', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    type Rec = {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      maxAlternatives: number;
      start: () => void;
      stop: () => void;
      onresult: ((e: unknown) => void) | null;
      onerror: ((e: unknown) => void) | null;
      onend: (() => void) | null;
    };
    const instances: Rec[] = [];
    window.SpeechRecognition = vi.fn(() => {
      const rec: Rec = {
        continuous: false,
        interimResults: false,
        lang: 'en-US',
        maxAlternatives: 1,
        start: vi.fn(),
        stop: vi.fn(),
        onresult: null,
        onerror: null,
        onend: null,
      };
      instances.push(rec);
      return rec;
    }) as unknown as typeof window.SpeechRecognition;
    const instance = () => instances[instances.length - 1]!;

    const post = vi
      .spyOn(api, 'apiPost')
      .mockResolvedValueOnce({ ok: true, message: 'Hoist Up moved' })
      .mockResolvedValueOnce({ ok: true, label: 'Hoist Up' })
      .mockResolvedValueOnce({ ok: false, reason: 'command_not_allowlisted' })
      .mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new Error('voice failed'))
      .mockRejectedValueOnce('nope')
      .mockResolvedValueOnce({ ok: true, label: 'Trolley L' })
      .mockRejectedValueOnce(new Error('trolley failed'))
      .mockResolvedValueOnce({ ok: false });

    renderWithProviders(<MediaPage />);
    await screen.findByText(/Device camera notes/);
    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({
      results: [{ isFinal: false, length: 0 }],
    });
    expect(await screen.findByText('Nothing heard')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({
      results: [[{ transcript: 'go up' }]],
    });
    await waitFor(() => expect(toastMocks.ok).toHaveBeenCalledWith('up'));
    expect(await screen.findByText('Hoist Up moved')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({
      results: [
        {
          isFinal: false,
          length: 1,
          0: { transcript: 'hoist' },
        },
      ],
    });
    expect(await screen.findByText('Heard: hoist')).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({
      results: {
        length: 2,
        0: undefined,
        1: {
          isFinal: false,
          length: 3,
          0: { transcript: '   ' },
          1: { transcript: 'hello' },
          2: { transcript: 'up' },
        },
      },
    });
    expect(
      await screen.findByText('Heard: up. Executed: Hoist Up'),
    ).toBeInTheDocument();
    instance()!.onresult?.({
      results: [[{ transcript: 'again' }]],
    });
    expect(
      screen.getByText('Heard: up. Executed: Hoist Up'),
    ).toBeInTheDocument();
    instance()!.onerror?.({ error: 'aborted' });
    instance()!.onerror?.({ error: 'network' });
    expect(
      screen.getByText('Heard: up. Executed: Hoist Up'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Heard: again')).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledWith('/media/voice', { transcript: 'up' });

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({ results: [[{ transcript: 'dance' }]] });
    expect(await screen.findByText(/Not executed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({ results: [[]] });
    expect(await screen.findByText('Nothing heard')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({
      results: [[{ transcript: 'hoist up', isFinal: true }]],
    });
    expect(
      await screen.findByText(/Not executed: unknown/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({
      results: [[{ transcript: 'hoist down' }]],
    });
    expect(
      await screen.findByText(/Not executed: voice failed/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({
      results: [[{ transcript: 'slow up' }]],
    });
    await waitFor(() => expect(toastMocks.err).toHaveBeenCalledWith('failed'));

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({
      results: [[{ transcript: 'trolley left' }]],
    });
    expect(await screen.findByText(/Executed: Trolley L/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({
      results: [[{ transcript: 'trolley right' }]],
    });
    expect(
      await screen.findByText(/Not executed: trolley failed/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({
      results: [[{ transcript: 'left' }]],
    });
    expect(
      await screen.findByText(/Not executed: unknown/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onend?.();
    expect(await screen.findByText('Nothing heard')).toBeInTheDocument();
    instance()!.onerror?.({ error: 'no-speech' });
    expect(await screen.findByText(/Nothing heard/)).toBeInTheDocument();
    instance()!.onend?.();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    await vi.advanceTimersByTimeAsync(8000);
    expect(instance()!.stop).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('renders without scan codes when the list request fails', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/media/camera') {
        return {
          deviceCameraEnabled: true,
          rtspUrl: null,
          notes: 'notes only',
        };
      }
      throw new Error('codes down');
    });
    renderWithProviders(<MediaPage />);
    expect(await screen.findByText('notes only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
  });

  it('reports empty barcode frame', async () => {
    class EmptyDetector {
      detect = vi.fn().mockResolvedValue([]);
    }
    (
      window as unknown as { BarcodeDetector: typeof EmptyDetector }
    ).BarcodeDetector = EmptyDetector;
    renderWithProviders(<MediaPage />);
    await screen.findByText(/Device camera notes/);
    await waitFor(() => expect(document.querySelector('video')).toBeTruthy());
    fireEvent.click(
      screen.getByRole('button', { name: 'Scan QR / barcode in frame' }),
    );
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(
        alerts.some((el) => /No code in frame/i.test(el.textContent ?? '')),
      ).toBe(true);
    });
  });

  it('stops a late camera stream after leaving the page', async () => {
    const pending: Array<
      (stream: {
        getTracks: () => Array<{ stop: ReturnType<typeof vi.fn> }>;
      }) => void
    > = [];
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(
          () =>
            new Promise((resolve) => {
              pending.push(resolve);
            }),
        ),
      },
    });
    const view = renderWithProviders(<MediaPage />);
    await screen.findByText(/Device camera notes/);
    view.unmount();
    const stop = vi.fn();
    pending[0]?.({ getTracks: () => [{ stop }] });
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });

  it('ignores a camera error that arrives after leaving the page', async () => {
    const pending: Array<(err: Error) => void> = [];
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(
          () =>
            new Promise((_resolve, reject) => {
              pending.push(reject);
            }),
        ),
      },
    });
    const view = renderWithProviders(<MediaPage />);
    await screen.findByText(/Device camera notes/);
    view.unmount();
    pending[0]?.(new Error('late'));
    await Promise.resolve();
  });

  it('shows the config link for supervisors', async () => {
    renderWithProviders(<MediaPage />, { role: 'supervisor' });
    expect(
      await screen.findByRole('link', { name: /Add or edit codes in Config/i }),
    ).toHaveAttribute('href', '/admin?section=codes');
  });

  it('reports camera warmup before zxing', async () => {
    renderWithProviders(<MediaPage />);
    await screen.findByText(/Device camera notes/);
    await waitFor(() => expect(document.querySelector('video')).toBeTruthy());
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'readyState', {
      configurable: true,
      get: () => 0,
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Scan QR / barcode in frame' }),
    );
    await waitFor(() =>
      expect(
        screen.getAllByText(/Camera still starting/i).length,
      ).toBeGreaterThan(0),
    );
  });

  it('reports missing video when the camera element is unavailable', async () => {
    cameraOverride.impl = () => ({
      videoRef: { current: null },
      camError: 'Camera permission denied',
      camRepromptAllowed: false,
      camShowSettingsHint: false,
      camPermissionDenied: true,
      retryCameraAccess: vi.fn(),
    });
    renderWithProviders(<MediaPage />);
    await screen.findByText(/Device camera notes/);
    fireEvent.click(
      screen.getByRole('button', { name: 'Scan QR / barcode in frame' }),
    );
    await waitFor(() =>
      expect(screen.getAllByText(/No camera video/i).length).toBeGreaterThan(0),
    );
  });

  it('decodes with zxing when BarcodeDetector is missing', async () => {
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
    zxingState.mode = 'TP-CRANE-DEMO-01';
    renderWithProviders(<MediaPage />);
    await screen.findByText(/Device camera notes/);
    const video = document.querySelector('video');
    expect(video).toBeTruthy();
    Object.defineProperty(video as HTMLVideoElement, 'readyState', {
      configurable: true,
      value: 2,
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Scan QR / barcode in frame' }),
    );
    await waitFor(() => expect(api.apiPost).toHaveBeenCalled());
    zxingState.mode = '';
    fireEvent.click(
      screen.getByRole('button', { name: 'Scan QR / barcode in frame' }),
    );
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(
        alerts.some((el) => /No code in frame/i.test(el.textContent ?? '')),
      ).toBe(true);
    });
    zxingState.mode = 'throw';
    fireEvent.click(
      screen.getByRole('button', { name: 'Scan QR / barcode in frame' }),
    );
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(
        alerts.some((el) => /No code in frame/i.test(el.textContent ?? '')),
      ).toBe(true);
    });
  });
});
