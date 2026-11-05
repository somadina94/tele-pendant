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

  it('shows camera error like media qr denial', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue('denied'),
      },
    });
    renderWithProviders(<FacePage />);
    expect(
      await screen.findByText(/blocked for this site/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reload page' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry camera' }),
    ).not.toBeInTheDocument();
  });

  it('requires login before enroll', async () => {
    renderWithProviders(<FacePage />);
    fireEvent.click(screen.getByRole('button', { name: enrollName }));
    expect(
      await screen.findByText('Sign in with password first, then enroll'),
    ).toBeInTheDocument();
  });

  it('enrolls when signed in and hides face login', async () => {
    localStorage.setItem('accessToken', 'tok');
    const post = vi.spyOn(api, 'apiPost').mockResolvedValueOnce({
      ok: true,
      limitation: 'basic only',
    });
    renderWithProviders(<FacePage />);
    expect(
      screen.queryByRole('button', { name: loginName }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: enrollName }));
    await captureAllPoses();
    await waitFor(() =>
      expect(
        screen.getByText(
          /Face enrolled|Rostro registrado|Visage enregistré|Gesicht gespeichert/i,
        ),
      ).toBeInTheDocument(),
    );
    expect(post).toHaveBeenCalledWith(
      '/auth/face/enroll',
      expect.objectContaining({ frames: expect.any(Array) }),
    );
  });

  it('face-logs in from the logged-out face screen', async () => {
    const post = vi.spyOn(api, 'apiPost').mockResolvedValueOnce({
      accessToken: 'face',
      user: {
        id: '1',
        email: 'a@b.com',
        role: 'admin',
        displayName: 'Admin',
        locale: 'en',
      },
      limitation: 'matched',
    });
    renderWithProviders(<FacePage skipCamera />);
    fireEvent.change(screen.getByLabelText(/Email hint/), {
      target: { value: 'a@b.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: loginName }));
    await captureAllPoses();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('accessToken')).toBe('face');
  });

  it('rejects face login when accessToken is missing', async () => {
    vi.spyOn(api, 'apiPost').mockResolvedValueOnce({
      limitation: 'no token',
    });
    renderWithProviders(<FacePage skipCamera />);
    fireEvent.change(screen.getByLabelText(/Email hint/), {
      target: { value: 'a@b.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: loginName }));
    await captureAllPoses();
    expect(
      await screen.findByText('Face match failed — use password login'),
    ).toBeInTheDocument();
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
        screen.getByText(
          /Face enrolled|Rostro registrado|Visage enregistré|Gesicht gespeichert/i,
        ),
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
      .mockRejectedValueOnce('enroll string');
    renderWithProviders(<FacePage />);
    fireEvent.click(screen.getByRole('button', { name: enrollName }));
    await captureAllPoses();
    expect(await screen.findByText('enroll boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: enrollName }));
    await captureAllPoses();
    expect(await screen.findByText('Enroll failed')).toBeInTheDocument();

    localStorage.removeItem('accessToken');
    vi.spyOn(api, 'apiPost')
      .mockRejectedValueOnce(new Error('login boom'))
      .mockRejectedValueOnce('login string');
    renderWithProviders(<FacePage skipCamera />);
    fireEvent.click(screen.getByRole('button', { name: loginName }));
    await captureAllPoses();
    expect(await screen.findByText('login boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: loginName }));
    await captureAllPoses();
    expect(
      await screen.findByText('Face match failed — use password login'),
    ).toBeInTheDocument();
  });
});
