import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/toast', () => ({
  toastErr: vi.fn(),
  toastOk: vi.fn(),
}));
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigUsersSection, EditUserSheet } from './config-users-section';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

const operatorRow = {
  id: 'op-1',
  email: 'op@example.com',
  displayName: 'Operator One',
  role: 'operator',
  suspended: false,
  locale: 'en',
};

describe('ConfigUsersSection', () => {
  it('covers the edit sheet field handlers directly', async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue(operatorRow);
    const { rerender } = renderWithProviders(
      <EditUserSheet
        user={operatorRow}
        open
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />,
    );
    const sheet = screen.getByRole('dialog');
    fireEvent.change(within(sheet).getByLabelText('Display name'), {
      target: { value: 'Direct Edit' },
    });
    fireEvent.change(within(sheet).getByLabelText('Email'), {
      target: { value: 'direct@example.com' },
    });
    fireEvent.change(within(sheet).getByLabelText('Role'), {
      target: { value: 'supervisor' },
    });
    fireEvent.change(within(sheet).getByLabelText('New password (optional)'), {
      target: { value: 'password12' },
    });
    fireEvent.click(within(sheet).getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
    rerender(
      <EditUserSheet
        user={{ ...operatorRow, displayName: 'Other', role: 'supervisor' }}
        open
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />,
    );
    expect(within(sheet).getByLabelText('Display name')).toHaveValue('Other');
  });

  it('closes the edit sheet without saving', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiGet').mockResolvedValue([operatorRow]);
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    await screen.findByText('Operator One');
    await user.click(
      screen.getByRole('button', { name: 'Edit op@example.com' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('prefills the create role from the query string', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([]);
    renderWithProviders(<ConfigUsersSection />, {
      route: '/admin?section=users&role=operator',
      role: 'admin',
    });
    expect(await screen.findByLabelText('new user role')).toHaveValue(
      'operator',
    );
  });

  it('lists users and creates a new account', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([operatorRow]);
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({ ok: true });
    renderWithProviders(<ConfigUsersSection />, {
      route: '/admin?section=users&role=supervisor',
      role: 'admin',
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

  it('shows protected and self rows', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([
      operatorRow,
      {
        id: 'u-test',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'admin',
        suspended: false,
      },
      {
        id: 'admin-2',
        email: 'root@example.com',
        displayName: null,
        role: 'admin',
        suspended: false,
      },
    ]);
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    expect(await screen.findByText('You')).toBeInTheDocument();
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });

  it('loads supervisor role into the edit sheet', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiGet').mockResolvedValue([
      {
        ...operatorRow,
        role: 'supervisor',
        displayName: 'Supervisor',
      },
    ]);
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    await screen.findByText('Supervisor');
    await user.click(
      await screen.findByRole('button', { name: 'Edit op@example.com' }),
    );
    const sheet = screen.getByRole('dialog');
    const roleSelect = within(sheet).getByLabelText('Role');
    expect(roleSelect).toHaveValue('supervisor');
  });

  it('saves profile edits without changing the password', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiGet').mockResolvedValue([operatorRow]);
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue(operatorRow);
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    await screen.findByText('Operator One');
    await user.click(
      screen.getByRole('button', { name: 'Edit op@example.com' }),
    );
    const sheet = screen.getByRole('dialog');
    fireEvent.change(within(sheet).getByLabelText('Display name'), {
      target: { value: 'Renamed' },
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/users/op-1',
        expect.not.objectContaining({ password: expect.anything() }),
      ),
    );
  });

  it('edits a user from the sheet', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiGet').mockResolvedValue([operatorRow]);
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue(operatorRow);
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    await screen.findByText('Operator One');
    await user.click(
      screen.getByRole('button', { name: 'Edit op@example.com' }),
    );
    const sheet = screen.getByRole('dialog');
    fireEvent.change(within(sheet).getByLabelText('Display name'), {
      target: { value: 'Updated Name' },
    });
    const roleSelect = sheet.querySelector('select');
    expect(roleSelect).not.toBeNull();
    fireEvent.change(roleSelect!, { target: { value: 'supervisor' } });
    fireEvent.click(within(sheet).getByRole('switch'));
    fireEvent.change(within(sheet).getByLabelText('New password (optional)'), {
      target: { value: 'newpass12' },
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/users/op-1',
        expect.objectContaining({
          displayName: 'Updated Name',
          role: 'supervisor',
          suspended: true,
          password: 'newpass12',
        }),
      ),
    );
  });

  it('suspends and removes a managed user', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiGet').mockResolvedValue([operatorRow]);
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({
      ...operatorRow,
      suspended: true,
    });
    const del = vi.spyOn(api, 'apiDelete').mockResolvedValue({ ok: true });
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    await screen.findByText('Operator One');
    await user.click(screen.getByRole('button', { name: 'Suspend user' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/users/op-1', { suspended: true }),
    );
    await user.click(
      screen.getByRole('button', { name: /Remove op@example.com/i }),
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/users/op-1'));
  });

  it('opens edit with email fallback when display name is missing', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiGet').mockResolvedValue([
      { ...operatorRow, displayName: null },
    ]);
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    await screen.findByText('op@example.com');
    await user.click(
      screen.getByRole('button', { name: 'Edit op@example.com' }),
    );
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByLabelText('Display name')).toHaveValue('');
    await user.keyboard('{Escape}');
    await user.click(
      screen.getByRole('button', { name: 'Remove op@example.com' }),
    );
    expect(
      screen.getByText(/Permanently delete op@example.com\?/),
    ).toBeInTheDocument();
  });

  it('reactivates a suspended user', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiGet').mockResolvedValue([
      { ...operatorRow, suspended: true, displayName: null },
    ]);
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({
      ...operatorRow,
      suspended: false,
    });
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    await screen.findByText('Suspended');
    await user.click(screen.getByRole('button', { name: 'Reactivate user' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/users/op-1', { suspended: false }),
    );
  });

  it('handles suspend and remove errors', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiGet').mockResolvedValue([operatorRow]);
    vi.spyOn(api, 'apiPatch').mockRejectedValue('nope');
    vi.spyOn(api, 'apiDelete').mockRejectedValue('nope');
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    await screen.findByText('Operator One');
    await user.click(screen.getByRole('button', { name: 'Suspend user' }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() =>
      expect(toastErr).toHaveBeenCalledWith('Could not update user'),
    );
    await user.click(
      screen.getByRole('button', { name: /Remove op@example.com/i }),
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(toastErr).toHaveBeenCalledWith('Could not remove user'),
    );
  });

  it('handles edit sheet errors', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiGet').mockResolvedValue([operatorRow]);
    vi.spyOn(api, 'apiPatch').mockRejectedValue(new Error('sheet fail'));
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    await screen.findByText('Operator One');
    await user.click(
      screen.getByRole('button', { name: 'Edit op@example.com' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('sheet fail'));
  });

  it('handles non-Error edit sheet failures', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiGet').mockResolvedValue([operatorRow]);
    vi.spyOn(api, 'apiPatch').mockRejectedValue('nope');
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    await screen.findByText('Operator One');
    await user.click(
      screen.getByRole('button', { name: 'Edit op@example.com' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() =>
      expect(toastErr).toHaveBeenCalledWith('Could not update user'),
    );
  });

  it('shows load errors', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(new Error('users down'));
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    expect(await screen.findByText('users down')).toBeInTheDocument();
    vi.spyOn(api, 'apiGet').mockRejectedValue('nope');
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    expect(await screen.findByText('Could not load users')).toBeInTheDocument();
  });

  it('surfaces Error messages from create, suspend, and remove', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiGet').mockResolvedValue([operatorRow]);
    vi.spyOn(api, 'apiPost').mockRejectedValue(new Error('duplicate email'));
    vi.spyOn(api, 'apiPatch').mockRejectedValue(new Error('patch failed'));
    vi.spyOn(api, 'apiDelete').mockRejectedValue(new Error('delete failed'));
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    await screen.findByText('Operator One');
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
      expect(toastErr).toHaveBeenCalledWith('duplicate email'),
    );
    await user.click(screen.getByRole('button', { name: 'Suspend user' }));
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('patch failed'));
    await user.click(
      screen.getByRole('button', { name: /Remove op@example.com/i }),
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('delete failed'));
  });

  it('toasts email when create succeeds without a display name in the message', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([]);
    vi.spyOn(api, 'apiPost').mockResolvedValue({ ok: true });
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
    const nameInput = screen.getByLabelText('new user display name');
    nameInput.removeAttribute('required');
    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('new user email'), {
      target: { value: 'only@example.com' },
    });
    fireEvent.change(screen.getByLabelText('new user password'), {
      target: { value: 'password1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add user/i }));
    const { toastOk } = await import('@/lib/toast');
    await waitFor(() =>
      expect(toastOk).toHaveBeenCalledWith('Added only@example.com.'),
    );
  });

  it('shows submit errors and empty state', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([]);
    vi.spyOn(api, 'apiPost').mockRejectedValue('nope');
    renderWithProviders(<ConfigUsersSection />, { role: 'admin' });
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
