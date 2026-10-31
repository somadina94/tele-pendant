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
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(localStorage.getItem('accessToken')).toBe('tok');
  });

  it('shows error message on failure', async () => {
    vi.spyOn(api, 'apiPost').mockRejectedValue(new Error('bad creds'));
    renderWithProviders(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('bad creds')).toBeInTheDocument();
  });

  it('shows generic error for non-Error throws', async () => {
    vi.spyOn(api, 'apiPost').mockRejectedValue('nope');
    renderWithProviders(<LoginPage />);
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
});
