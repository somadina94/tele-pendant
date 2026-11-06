import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminUserMenu } from './admin-user-menu';
import { renderWithProviders } from '../test/render';

describe('AdminUserMenu', () => {
  it('shows change password for any signed-in role', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminUserMenu />, { role: 'supervisor' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByText('Change password')).toBeInTheDocument();
  });

  it('opens user management actions for admins', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminUserMenu />, {
      route: '/admin?section=plc',
      role: 'admin',
    });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByText('Add operator')).toBeInTheDocument();
    expect(screen.getByText('Manage users')).toBeInTheDocument();
    await user.click(screen.getByText('Add operator'));
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByText('Manage users'));
  });
});
