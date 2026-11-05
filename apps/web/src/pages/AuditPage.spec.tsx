import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { AuditPage } from './AuditPage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

const samplePage = {
  items: [
    {
      id: '1',
      userEmail: 'admin@example.com',
      userDisplayName: 'Administrator',
      action: 'register.update',
      resource: 'holding.hoistHeightMm',
      result: 'success',
      createdAt: '2026-01-02T03:04:00.000Z',
    },
    {
      id: '2',
      userEmail: null,
      action: 'cell.activate',
      resource: null,
      result: 'denied',
      createdAt: '2026-01-02T03:05:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 25,
};

describe('AuditPage', () => {
  it('lists email, action, resource, result, and time', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(samplePage);
    renderWithProviders(<AuditPage />);
    expect(await screen.findByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText(/register.update/)).toBeInTheDocument();
    expect(screen.getByText(/holding.hoistHeightMm/)).toBeInTheDocument();
    expect(screen.getByText(/success/)).toBeInTheDocument();
    expect(screen.getByText(/cell.activate/)).toBeInTheDocument();
    expect(screen.getByText(/denied/)).toBeInTheDocument();
    expect(screen.getByText(/1–2 of 2/)).toBeInTheDocument();
  });

  it('shows the API error', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(new Error('Forbidden'));
    renderWithProviders(<AuditPage />);
    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
  });

  it('shows a fallback when the failure is not an Error', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue('nope');
    renderWithProviders(<AuditPage />);
    expect(await screen.findByText('Audit failed')).toBeInTheDocument();
  });
});
