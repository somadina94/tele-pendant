import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { LoginPage } from './LoginPage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

describe('LoginPage', () => {
  it('logs in and navigates', async () => {
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({
      accessToken: 'tok',
      user: {
        id: '1',
        email: 'admin@example.com',
        role: 'admin',
        displayName: 'Admin',
        locale: 'en',
      },
    });
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'change-me-admin-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(localStorage.getItem('accessToken')).toBe('tok');
  });

  it('prompts for OTP when 2FA is required then verifies', async () => {
    const post = vi
      .spyOn(api, 'apiPost')
      .mockResolvedValueOnce({
        requiresTwoFactor: true,
        challengeId: 'chal-1',
        emailHint: 'ad***@example.com',
      })
      .mockResolvedValueOnce({
        challengeId: 'chal-2',
        emailHint: 'ad***@example.com',
        requiresTwoFactor: true,
      })
      .mockResolvedValueOnce({
        accessToken: 'tok2',
        user: {
          id: '1',
          email: 'admin@example.com',
          role: 'admin',
          displayName: 'Admin',
          locale: 'en',
          twoFactorEnabled: true,
        },
      });
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'change-me-admin-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByLabelText('Verification code'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/login/otp/resend', {
        challengeId: 'chal-1',
      }),
    );
    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/login/otp', {
        challengeId: 'chal-2',
        code: '123456',
      }),
    );
    expect(localStorage.getItem('accessToken')).toBe('tok2');
  });

  it('returns from OTP step to password form', async () => {
    vi.spyOn(api, 'apiPost').mockResolvedValueOnce({
      requiresTwoFactor: true,
      challengeId: 'chal-1',
      emailHint: 'ad***@example.com',
    });
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'change-me-admin-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByRole('button', { name: 'Back to password' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to password' }));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows OTP resend errors', async () => {
    vi.spyOn(api, 'apiPost')
      .mockResolvedValueOnce({
        requiresTwoFactor: true,
        challengeId: 'chal-1',
        emailHint: 'ad***@example.com',
      })
      .mockRejectedValueOnce(new Error('resend blocked'))
      .mockRejectedValueOnce('resend string');
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'change-me-admin-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByRole('button', { name: 'Resend code' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));
    expect(await screen.findByText('resend blocked')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));
    expect(await screen.findByText('Login failed')).toBeInTheDocument();
  });

  it('shows error message on failure', async () => {
    vi.spyOn(api, 'apiPost').mockRejectedValue(new Error('bad creds'));
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'change-me-admin-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('bad creds')).toBeInTheDocument();
  });

  it('shows generic error for non-Error throws', async () => {
    vi.spyOn(api, 'apiPost').mockRejectedValue('nope');
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'change-me-admin-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Login failed')).toBeInTheDocument();
  });

  it('updates email and password fields', () => {
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'a@b.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password1' },
    });
    expect(screen.getByLabelText('Email')).toHaveValue('a@b.com');
  });

  it('switches the chrome to Spanish and saves a pinned locale', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(new Error('expired'));
    const patch = vi.spyOn(api, 'apiPatch').mockRejectedValue(new Error('no'));
    localStorage.setItem('accessToken', 'tok');
    renderWithProviders(<LoginPage />);
    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();
    // Session check cleared the dead token; restore one so locale pin hits the API.
    localStorage.setItem('accessToken', 'tok');
    fireEvent.change(screen.getByLabelText('Language'), {
      target: { value: 'es' },
    });
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/auth/locale', { locale: 'es' }),
    );
    fireEvent.change(screen.getByLabelText('Idioma'), {
      target: { value: 'en' },
    });
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('sends a still-valid session from login to operator on refresh', async () => {
    localStorage.setItem('accessToken', 'tok');
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      id: '1',
      email: 'admin@example.com',
      role: 'admin',
      displayName: 'Admin',
      locale: 'en',
    });
    renderWithProviders(<LoginPage />);
    await waitFor(() => expect(api.apiGet).toHaveBeenCalledWith('/auth/me'));
  });
});
