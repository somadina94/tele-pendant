import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/toast', () => ({
  toastErr: vi.fn(),
  toastOk: vi.fn(),
}));
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from './account-menu';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

describe('AccountMenu', () => {
  it('is hidden when no session user', () => {
    renderWithProviders(<AccountMenu />);
    expect(
      screen.queryByRole('button', { name: 'Account menu' }),
    ).not.toBeInTheDocument();
  });

  it('submits change password', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({ ok: true });
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Change password'));
    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'old-password' },
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'new-password' },
    });
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/auth/password', {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      }),
    );
    const { toastOk } = await import('@/lib/toast');
    expect(toastOk).toHaveBeenCalled();
  });

  it('uses email prefix when display name is empty', async () => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 'u2',
        email: 'operator@plant.local',
        displayName: '   ',
        role: 'operator',
      }),
    );
    renderWithProviders(<AccountMenu />);
    expect(screen.getByText('operator')).toBeInTheDocument();
  });

  it('surfaces API errors', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiPatch').mockRejectedValue(new Error('bad password'));
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Change password'));
    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'old-password' },
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'new-password' },
    });
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('bad password'));
  });

  it('handles non-Error password failures', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiPatch').mockRejectedValue('nope');
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Change password'));
    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'old-password' },
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'new-password' },
    });
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() =>
      expect(toastErr).toHaveBeenCalledWith('Could not update password'),
    );
  });

  it('shows admin account shortcuts', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />, {
      route: '/operator',
      role: 'admin',
    });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByText('Add operator')).toBeInTheDocument();
    await user.click(screen.getByText('Add operator'));
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Add supervisor'));
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Manage users'));
  });

  it('falls back to Account when the email local part is empty', () => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 'u3',
        email: '@domain.local',
        displayName: null,
        role: 'operator',
      }),
    );
    renderWithProviders(<AccountMenu />);
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  it('shows mismatch error without calling API', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'apiPatch');
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Change password'));
    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'old-password' },
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'other-password' },
    });
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    const { toastErr } = await import('@/lib/toast');
    expect(toastErr).toHaveBeenCalledWith('New passwords do not match');
    expect(patch).not.toHaveBeenCalled();
  });
});
