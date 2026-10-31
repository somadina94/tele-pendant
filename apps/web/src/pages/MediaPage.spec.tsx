import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MediaPage } from './MediaPage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

describe('MediaPage', () => {
  beforeEach(() => {
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
      routeHint: '/ops',
    });
  });

  it('resolves codes and scans barcodes', async () => {
    class FakeDetector {
      detect = vi.fn().mockResolvedValue([{ rawValue: 'TP-CRANE-DEMO-01' }]);
    }
    (
      window as unknown as { BarcodeDetector: typeof FakeDetector }
    ).BarcodeDetector = FakeDetector;

    renderWithProviders(<MediaPage />);
    expect(await screen.findByText(/Device camera notes/)).toBeInTheDocument();
    expect(screen.getByText(/Configured RTSP/)).toBeInTheDocument();

    const codeInput = screen.getByDisplayValue('TP-CRANE-DEMO-01');
    fireEvent.change(codeInput, { target: { value: 'TP-CUSTOM' } });
    expect(codeInput).toHaveValue('TP-CUSTOM');
    fireEvent.change(codeInput, { target: { value: 'TP-CRANE-DEMO-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));

    await waitFor(() =>
      expect(screen.getByText(/Bay \(TP-CRANE-DEMO-01\)/)).toBeInTheDocument(),
    );

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
    expect(await screen.findByText('no cam')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Scan QR / barcode in frame' }),
    );
    expect(
      await screen.findByText(/BarcodeDetector not supported/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(await screen.findByText('bad code')).toBeInTheDocument();

    vi.spyOn(api, 'apiPost').mockRejectedValueOnce('x');
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(await screen.findByText('Resolve failed')).toBeInTheDocument();

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
      await screen.findByText('Camera permission denied'),
    ).toBeInTheDocument();
  });

  it('runs speech recognition success and error paths', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    type Rec = {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      stop: () => void;
      onresult: ((e: unknown) => void) | null;
      onerror: ((e: unknown) => void) | null;
    };
    const instances: Rec[] = [];
    window.SpeechRecognition = vi.fn(() => {
      const rec: Rec = {
        continuous: false,
        interimResults: false,
        lang: 'en-US',
        start: vi.fn(),
        stop: vi.fn(),
        onresult: null,
        onerror: null,
      };
      instances.push(rec);
      return rec;
    }) as unknown as typeof window.SpeechRecognition;
    const instance = () => instances[instances.length - 1]!;

    vi.spyOn(api, 'apiPost')
      .mockResolvedValueOnce({ ok: true, label: 'Hoist Up' })
      .mockResolvedValueOnce({ ok: false, reason: 'command_not_allowlisted' })
      .mockResolvedValueOnce({ ok: false });

    renderWithProviders(<MediaPage />);
    await screen.findByText(/Device camera notes/);
    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({
      results: [[{ transcript: 'hoist up' }]],
    });
    expect(await screen.findByText(/Executed: Hoist Up/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({ results: [[{ transcript: 'dance' }]] });
    expect(await screen.findByText(/Not executed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onresult?.({ results: [[]] });
    await waitFor(() => expect(api.apiPost).toHaveBeenCalled());
    expect(
      await screen.findByText(/Not executed: unknown/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    instance()!.onerror?.({ error: 'no-speech' });
    expect(
      await screen.findByText(/Voice error: no-speech/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Listen/ }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(instance()!.stop).toHaveBeenCalled();
    vi.useRealTimers();
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
    fireEvent.click(
      screen.getByRole('button', { name: 'Scan QR / barcode in frame' }),
    );
    expect(await screen.findByText('No code in frame')).toBeInTheDocument();
  });
});
