import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { FacePage } from './FacePage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

const enrollName = 'Enroll (3-step challenge · requires session)';
const loginName = 'Face login (3-step challenge)';

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
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toDataURL: () => 'data:image/jpeg;base64,abc',
        } as unknown as HTMLElement;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    }) as typeof document.createElement);
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
    await waitFor(() =>
      expect(screen.getByText('basic only')).toBeInTheDocument(),
    );
    expect(post).toHaveBeenCalledWith(
      '/auth/face/enroll',
      expect.objectContaining({ frames: expect.any(Array) }),
    );
    fireEvent.click(screen.getByRole('button', { name: loginName }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(localStorage.getItem('accessToken')).toBe('face');
  });

  it('no-ops face login when video ref is missing', async () => {
    const post = vi.spyOn(api, 'apiPost');
    renderWithProviders(<FacePage skipCamera />);
    fireEvent.click(screen.getByRole('button', { name: loginName }));
    expect(post).not.toHaveBeenCalled();
  });

  it('surfaces camera-not-ready when enrolling without a video element', async () => {
    localStorage.setItem('accessToken', 'tok');
    renderWithProviders(<FacePage skipCamera />);
    fireEvent.click(screen.getByRole('button', { name: enrollName }));
    expect(await screen.findByText('Camera not ready')).toBeInTheDocument();
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
    expect(await screen.findByText('enroll boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: loginName }));
    expect(await screen.findByText('login boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: enrollName }));
    expect(await screen.findByText('Enroll failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: loginName }));
    expect(
      await screen.findByText('Face match failed — use password login'),
    ).toBeInTheDocument();
  });
});
