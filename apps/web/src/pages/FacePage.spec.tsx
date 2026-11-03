import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { FacePage } from './FacePage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';
import * as faceCapture from '../lib/face-capture';

const enrollName = 'Enroll (3-step challenge · requires session)';
const loginName = 'Face login (3-step challenge)';

async function captureAllPoses() {
  for (let i = 1; i <= 3; i++) {
    fireEvent.click(
      screen.getByRole('button', {
        name: `Capture pose ${i}/3`,
      }),
    );
    if (i < 3) {
      await screen.findByRole('button', {
        name: `Capture pose ${i + 1}/3`,
      });
    }
  }
}

describe('FacePage', () => {
  beforeEach(() => {
    const track = { stop: vi.fn() };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [track],
        }),
      },
    });
    vi.spyOn(faceCapture, 'captureDataUrl').mockResolvedValue(
      'data:image/jpeg;base64,abc',
    );
  });

  it('shows camera error', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    renderWithProviders(<FacePage />);
    expect(await screen.findByText('denied')).toBeInTheDocument();
  });

  it('requires login before enroll', async () => {
    renderWithProviders(<FacePage />);
    fireEvent.click(screen.getByRole('button', { name: enrollName }));
    expect(
      await screen.findByText('Sign in with password first, then enroll'),
    ).toBeInTheDocument();
  });

  it('enrolls and face-logs in', async () => {
    localStorage.setItem('accessToken', 'tok');
    const post = vi
      .spyOn(api, 'apiPost')
      .mockResolvedValueOnce({ ok: true, limitation: 'basic only' })
      .mockResolvedValueOnce({
        accessToken: 'face',
        limitation: 'matched',
      });
    renderWithProviders(<FacePage />);
    fireEvent.change(screen.getByLabelText(/Email hint/), {
      target: { value: 'a@b.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: enrollName }));
    await captureAllPoses();
    await waitFor(() =>
      expect(
        screen.getByText(/Face enrolled|Rostro registrado|Visage enregistré|Gesicht gespeichert/i),
      ).toBeInTheDocument(),
    );
    expect(post).toHaveBeenCalledWith(
      '/auth/face/enroll',
      expect.objectContaining({ frames: expect.any(Array) }),
    );
    fireEvent.click(screen.getByRole('button', { name: loginName }));
    await captureAllPoses();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(localStorage.getItem('accessToken')).toBe('face');
  });

  it('completes a skip-camera challenge with placeholder frames', async () => {
    localStorage.setItem('accessToken', 'tok');
    const post = vi
      .spyOn(api, 'apiPost')
      .mockResolvedValue({ ok: true, limitation: 'skip-ok' });
    renderWithProviders(<FacePage skipCamera />);
    fireEvent.click(screen.getByRole('button', { name: enrollName }));
    await captureAllPoses();
    await waitFor(() =>
      expect(
        screen.getByText(/Face enrolled|Rostro registrado|Visage enregistré|Gesicht gespeichert/i),
      ).toBeInTheDocument(),
    );
    expect(post).toHaveBeenCalledWith(
      '/auth/face/enroll',
      expect.objectContaining({
        frames: [
          'data:image/jpeg;base64,abc',
          'data:image/jpeg;base64,abc',
          'data:image/jpeg;base64,abc',
        ],
      }),
    );
  });

  it('cancels an in-progress challenge', async () => {
    localStorage.setItem('accessToken', 'tok');
    renderWithProviders(<FacePage skipCamera />);
    fireEvent.click(screen.getByRole('button', { name: enrollName }));
    expect(
      await screen.findByRole('button', { name: 'Capture pose 1/3' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel challenge' }));
    expect(
      screen.getByRole('button', { name: enrollName }),
    ).toBeInTheDocument();
  });

  it('surfaces enroll and login failures', async () => {
    localStorage.setItem('accessToken', 'tok');
    vi.spyOn(api, 'apiPost')
      .mockRejectedValueOnce(new Error('enroll boom'))
      .mockRejectedValueOnce(new Error('login boom'))
      .mockRejectedValueOnce('enroll string')
      .mockRejectedValueOnce('login string');
    renderWithProviders(<FacePage />);
    fireEvent.click(screen.getByRole('button', { name: enrollName }));
    await captureAllPoses();
    expect(await screen.findByText('enroll boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: loginName }));
    await captureAllPoses();
    expect(await screen.findByText('login boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: enrollName }));
    await captureAllPoses();
    expect(await screen.findByText('Enroll failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: loginName }));
    await captureAllPoses();
    expect(
      await screen.findByText('Face match failed — use password login'),
    ).toBeInTheDocument();
  });
});
