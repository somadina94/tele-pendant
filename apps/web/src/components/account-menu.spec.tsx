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

  it('sets a reset PIN and marks the session as having one', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({ ok: true });
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Set reset PIN'));
    fireEvent.change(screen.getByLabelText('Plant reset PIN'), {
      target: { value: '  plant  ' },
    });
    fireEvent.change(screen.getByLabelText('New reset PIN'), {
      target: { value: '1234' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new reset PIN'), {
      target: { value: '1234' },
    });
    await user.click(screen.getByRole('button', { name: 'Save reset PIN' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/auth/safe-action-pin', {
        newPin: '1234',
        currentPin: 'plant',
      }),
    );
    const { toastOk } = await import('@/lib/toast');
    expect(toastOk).toHaveBeenCalledWith('Reset PIN updated.');
    expect(JSON.parse(localStorage.getItem('user')!).hasSafeActionPin).toBe(
      true,
    );
  });

  it('requires plant PIN before first personal PIN (TP-38)', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'apiPatch');
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Set reset PIN'));
    fireEvent.change(screen.getByLabelText('New reset PIN'), {
      target: { value: '1234' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new reset PIN'), {
      target: { value: '1234' },
    });
    await user.click(screen.getByRole('button', { name: 'Save reset PIN' }));
    const { toastErr } = await import('@/lib/toast');
    expect(toastErr).toHaveBeenCalledWith(
      'Plant reset PIN is required to set your first personal PIN',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('changes reset PIN with the current personal PIN', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({ ok: true });
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 'u1',
        email: 'op@plant.local',
        displayName: 'Op',
        role: 'operator',
        hasSafeActionPin: true,
      }),
    );
    renderWithProviders(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Change reset PIN'));
    fireEvent.change(screen.getByLabelText('Current reset PIN'), {
      target: { value: '1234' },
    });
    fireEvent.change(screen.getByLabelText('New reset PIN'), {
      target: { value: '5678' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new reset PIN'), {
      target: { value: '5678' },
    });
    await user.click(screen.getByRole('button', { name: 'Save reset PIN' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/auth/safe-action-pin', {
        newPin: '5678',
        currentPin: '1234',
      }),
    );
  });

  it('requires current personal PIN when changing an existing one', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'apiPatch');
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 'u1',
        email: 'op@plant.local',
        displayName: 'Op',
        role: 'operator',
        hasSafeActionPin: true,
      }),
    );
    renderWithProviders(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Change reset PIN'));
    fireEvent.change(screen.getByLabelText('New reset PIN'), {
      target: { value: '5678' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new reset PIN'), {
      target: { value: '5678' },
    });
    await user.click(screen.getByRole('button', { name: 'Save reset PIN' }));
    const { toastErr } = await import('@/lib/toast');
    expect(toastErr).toHaveBeenCalledWith('Current reset PIN is required');
    expect(patch).not.toHaveBeenCalled();
  });

  it('shows reset PIN mismatch without calling API', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'apiPatch');
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Set reset PIN'));
    fireEvent.change(screen.getByLabelText('New reset PIN'), {
      target: { value: '1234' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new reset PIN'), {
      target: { value: '9999' },
    });
    await user.click(screen.getByRole('button', { name: 'Save reset PIN' }));
    const { toastErr } = await import('@/lib/toast');
    expect(toastErr).toHaveBeenCalledWith('New reset PINs do not match');
    expect(patch).not.toHaveBeenCalled();
  });

  it('surfaces reset PIN API errors', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiPatch').mockRejectedValue(new Error('pin locked'));
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Set reset PIN'));
    fireEvent.change(screen.getByLabelText('Plant reset PIN'), {
      target: { value: 'plant' },
    });
    fireEvent.change(screen.getByLabelText('New reset PIN'), {
      target: { value: '1234' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new reset PIN'), {
      target: { value: '1234' },
    });
    await user.click(screen.getByRole('button', { name: 'Save reset PIN' }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('pin locked'));
  });

  it('handles non-Error reset PIN failures', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiPatch').mockRejectedValue('nope');
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Set reset PIN'));
    fireEvent.change(screen.getByLabelText('Plant reset PIN'), {
      target: { value: 'plant' },
    });
    fireEvent.change(screen.getByLabelText('New reset PIN'), {
      target: { value: '1234' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new reset PIN'), {
      target: { value: '1234' },
    });
    await user.click(screen.getByRole('button', { name: 'Save reset PIN' }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() =>
      expect(toastErr).toHaveBeenCalledWith('Could not update reset PIN'),
    );
  });

  it('still saves reset PIN when session storage was cleared', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiPatch').mockResolvedValue({ ok: true });
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Set reset PIN'));
    fireEvent.change(screen.getByLabelText('Plant reset PIN'), {
      target: { value: 'plant' },
    });
    fireEvent.change(screen.getByLabelText('New reset PIN'), {
      target: { value: '1234' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new reset PIN'), {
      target: { value: '1234' },
    });
    localStorage.removeItem('user');
    await user.click(screen.getByRole('button', { name: 'Save reset PIN' }));
    const { toastOk } = await import('@/lib/toast');
    await waitFor(() =>
      expect(toastOk).toHaveBeenCalledWith('Reset PIN updated.'),
    );
  });

  it('still saves reset PIN when session storage is corrupt', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiPatch').mockResolvedValue({ ok: true });
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Set reset PIN'));
    fireEvent.change(screen.getByLabelText('Plant reset PIN'), {
      target: { value: 'plant' },
    });
    fireEvent.change(screen.getByLabelText('New reset PIN'), {
      target: { value: '4321' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new reset PIN'), {
      target: { value: '4321' },
    });
    localStorage.setItem('user', '{not-json');
    await user.click(screen.getByRole('button', { name: 'Save reset PIN' }));
    const { toastOk } = await import('@/lib/toast');
    await waitFor(() =>
      expect(toastOk).toHaveBeenCalledWith('Reset PIN updated.'),
    );
  });

  it('enables email 2FA after OTP confirm and can disable it', async () => {
    const user = userEvent.setup();
    const post = vi
      .spyOn(api, 'apiPost')
      .mockResolvedValueOnce({
        requiresTwoFactor: true,
        challengeId: 'chal-en',
        emailHint: 'op***@plant.local',
      })
      .mockResolvedValueOnce({
        ok: true,
        twoFactorEnabled: true,
        user: {
          id: 'u-test',
          email: 'test@example.com',
          role: 'operator',
          displayName: 'Test User',
          locale: 'en',
          twoFactorEnabled: true,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        twoFactorEnabled: false,
        user: {
          id: 'u-test',
          email: 'test@example.com',
          role: 'operator',
          displayName: 'Test User',
          locale: 'en',
          twoFactorEnabled: false,
        },
      });
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Email 2FA'));
    await user.click(screen.getByRole('button', { name: 'Enable email 2FA' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/two-factor/enable'),
    );
    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '111222' },
    });
    await user.click(screen.getByRole('button', { name: 'Confirm code' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/two-factor/confirm', {
        challengeId: 'chal-en',
        code: '111222',
      }),
    );
    const { toastOk } = await import('@/lib/toast');
    expect(toastOk).toHaveBeenCalledWith('Email 2FA enabled.');

    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 'u-test',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'operator',
        twoFactorEnabled: true,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Email 2FA'));
    await user.click(screen.getByRole('button', { name: 'Disable email 2FA' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/two-factor/disable'),
    );
    expect(toastOk).toHaveBeenCalledWith('Email 2FA disabled.');
  });

  it('surfaces email 2FA enable errors', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiPost')
      .mockRejectedValueOnce(new Error('smtp missing'))
      .mockRejectedValueOnce('smtp string');
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Email 2FA'));
    await user.click(screen.getByRole('button', { name: 'Enable email 2FA' }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('smtp missing'));
    await user.click(screen.getByRole('button', { name: 'Enable email 2FA' }));
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('Login failed'));
  });

  it('surfaces email 2FA confirm failures', async () => {
    const user = userEvent.setup();
    const post = vi
      .spyOn(api, 'apiPost')
      .mockResolvedValueOnce({
        requiresTwoFactor: true,
        challengeId: 'chal-fail',
        emailHint: 'op***@plant.local',
      })
      .mockRejectedValueOnce(new Error('bad confirm'))
      .mockRejectedValueOnce('confirm string');
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Email 2FA'));
    await user.click(screen.getByRole('button', { name: 'Enable email 2FA' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/two-factor/enable'),
    );
    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '000000' },
    });
    await user.click(screen.getByRole('button', { name: 'Confirm code' }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('bad confirm'));
    await user.click(screen.getByRole('button', { name: 'Confirm code' }));
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('Login failed'));
  });

  it('surfaces email 2FA disable failures', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiPost')
      .mockRejectedValueOnce(new Error('disable failed'))
      .mockRejectedValueOnce('disable string');
    renderWithProviders(<AccountMenu />, { role: 'operator' });
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 'u-test',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'operator',
        twoFactorEnabled: true,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Email 2FA'));
    await user.click(screen.getByRole('button', { name: 'Disable email 2FA' }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() =>
      expect(toastErr).toHaveBeenCalledWith('disable failed'),
    );
    await user.click(screen.getByRole('button', { name: 'Disable email 2FA' }));
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('Login failed'));
  });
});
