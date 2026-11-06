import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { RequireRole } from './require-role';
import { renderWithProviders } from '../test/render';

describe('RequireRole', () => {
  it('renders children when the role is allowed', () => {
    renderWithProviders(
      <RequireRole allow={['supervisor', 'admin']}>
        <p>Secret config</p>
      </RequireRole>,
      { role: 'supervisor' },
    );
    expect(screen.getByText('Secret config')).toBeInTheDocument();
  });

  it('shows access denied with custom detail', () => {
    renderWithProviders(
      <RequireRole allow={['admin']} detail="Admins only">
        <p>Hidden</p>
      </RequireRole>,
      { role: 'operator' },
    );
    expect(screen.getByText('Admins only')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('shows default detail when role is missing', () => {
    renderWithProviders(
      <RequireRole allow={['admin']}>
        <p>Hidden</p>
      </RequireRole>,
    );
    expect(screen.getByText(/Permission denied/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Back to Operator/i }),
    ).toHaveAttribute('href', '/operator');
  });
});
