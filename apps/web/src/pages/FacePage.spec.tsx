import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { FacePage } from './FacePage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

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
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Enroll (requires logged-in session)',
      }),
    );
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
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Enroll (requires logged-in session)',
      }),
    );
    await waitFor(() =>
      expect(screen.getByText('basic only')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Face login' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(localStorage.getItem('accessToken')).toBe('face');
  });

  it('no-ops face login when video ref is missing', async () => {
    const post = vi.spyOn(api, 'apiPost');
    renderWithProviders(<FacePage skipCamera />);
    fireEvent.click(screen.getByRole('button', { name: 'Face login' }));
    expect(post).not.toHaveBeenCalled();
  });
});
