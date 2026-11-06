import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/toast', () => ({
  toastErr: vi.fn(),
  toastOk: vi.fn(),
}));
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ConfigUsersSection } from './config-users-section';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

describe('ConfigUsersSection', () => {
  it('lists users and creates a new account', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([
      {
        id: '1',
        email: 'op@example.com',
        displayName: 'Operator One',
        role: 'operator',
      },
    ]);
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({ ok: true });
    renderWithProviders(<ConfigUsersSection />, {
      route: '/admin?section=users&role=supervisor',
    });
    expect(await screen.findByText('Operator One')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('new user display name'), {
      target: { value: 'New Sup' },
    });
    fireEvent.change(screen.getByLabelText('new user email'), {
      target: { value: 'sup@example.com' },
    });
    fireEvent.change(screen.getByLabelText('new user password'), {
      target: { value: 'password1' },
    });
    fireEvent.change(screen.getByLabelText('new user role'), {
      target: { value: 'supervisor' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add user/i }));
    await waitFor(() => expect(post).toHaveBeenCalled());
  });

  it('shows load errors', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(new Error('users down'));
    renderWithProviders(<ConfigUsersSection />);
    expect(await screen.findByText('users down')).toBeInTheDocument();
    vi.spyOn(api, 'apiGet').mockRejectedValue('nope');
    renderWithProviders(<ConfigUsersSection />);
    expect(await screen.findByText('Could not load users')).toBeInTheDocument();
  });

  it('shows submit errors and empty state', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([]);
    vi.spyOn(api, 'apiPost').mockRejectedValue('nope');
    renderWithProviders(<ConfigUsersSection />);
    expect(await screen.findByText('No users yet.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('new user display name'), {
      target: { value: 'X' },
    });
    fireEvent.change(screen.getByLabelText('new user email'), {
      target: { value: 'x@example.com' },
    });
    fireEvent.change(screen.getByLabelText('new user password'), {
      target: { value: 'password1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add user/i }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() =>
      expect(toastErr).toHaveBeenCalledWith('Could not add user'),
    );
  });
});
