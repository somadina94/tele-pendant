import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/toast', () => ({
  toastErr: vi.fn(),
  toastOk: vi.fn(),
}));

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({ onSelect }: { onSelect?: (day?: Date) => void }) => (
    <div>
      <div role="grid" />
      <button
        type="button"
        onClick={() => onSelect?.(new Date('2026-01-15T12:00:00.000Z'))}
      >
        Pick stub day
      </button>
    </div>
  ),
}));
import userEvent from '@testing-library/user-event';
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

function paged(page: number, pageSize: number, total: number) {
  return {
    items: samplePage.items,
    total,
    page,
    pageSize,
  };
}

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

  it('filters, paginates, clears filters, and exports CSV', async () => {
    const user = userEvent.setup();
    const get = vi
      .spyOn(api, 'apiGet')
      .mockImplementation(async (path: string) => {
        if (path.includes('page=2')) return paged(2, 25, 80);
        return paged(1, 25, 80);
      });
    const download = vi.spyOn(api, 'apiDownload').mockResolvedValue();
    renderWithProviders(<AuditPage />);
    await screen.findByText(/1.25 of 80/);

    await user.click(screen.getByRole('button', { name: /Export CSV/i }));
    await waitFor(() => expect(download).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/Filter by user/i), 'alice');
    await waitFor(() =>
      expect(get.mock.calls.some(([path]) => path.includes('user=alice'))).toBe(
        true,
      ),
    );
    await user.click(screen.getByRole('button', { name: /Export CSV/i }));
    await waitFor(() =>
      expect(
        download.mock.calls.some(([path]) =>
          String(path).includes('user=alice'),
        ),
      ).toBe(true),
    );

    await user.click(screen.getByRole('button', { name: /Clear/i }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() =>
      expect(get.mock.calls.some(([path]) => path.includes('page=2'))).toBe(
        true,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    await user.click(
      screen.getByRole('button', { name: 'Go to previous page' }),
    );
    await user.click(screen.getByRole('button', { name: '4' }));
  });

  it('shows empty rows and handles export failure', async () => {
    const { toastErr } = await import('@/lib/toast');
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    vi.spyOn(api, 'apiDownload').mockRejectedValue(new Error('export fail'));
    renderWithProviders(<AuditPage />);
    expect(
      await screen.findByText(/No audit entries match these filters/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('export fail'));
    vi.spyOn(api, 'apiDownload').mockRejectedValue('nope');
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('Export failed'));
  });

  it('changes rows per page and shows ellipsis pages', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
      const pageMatch = path.match(/page=(\d+)/);
      const page = pageMatch ? Number(pageMatch[1]) : 1;
      const sizeMatch = path.match(/pageSize=(\d+)/);
      const pageSize = sizeMatch ? Number(sizeMatch[1]) : 25;
      return {
        items: samplePage.items,
        total: 200,
        page,
        pageSize,
      };
    });
    renderWithProviders(<AuditPage />);
    await screen.findByText('Administrator');
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '10' }));
    await waitFor(() =>
      expect(screen.getByText('More pages')).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(screen.getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: '5' }));
    expect(screen.getAllByText('More pages').length).toBeGreaterThan(0);
    for (let i = 0; i < 12; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    }
    expect(screen.getAllByText('More pages').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '20' }));
  });

  it('resets pagination when date filters change', async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path.includes('page=2')) return paged(2, 25, 80);
      return paged(1, 25, 80);
    });
    renderWithProviders(<AuditPage />);
    await screen.findByText(/1.25 of 80/);
    await user.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() =>
      expect(get.mock.calls.some(([path]) => path.includes('page=2'))).toBe(
        true,
      ),
    );
    fireEvent.click(screen.getAllByText('Pick a date')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Pick stub day' }));
    await waitFor(() =>
      expect(get.mock.calls.some(([path]) => path.includes('page=1'))).toBe(
        true,
      ),
    );
    fireEvent.click(screen.getAllByText('Pick a date')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Pick stub day' }));
    await waitFor(() =>
      expect(
        get.mock.calls.some(([path]) => path.includes('from=2026-01-15')),
      ).toBe(true),
    );
  });

  it('shows loading spinner on first fetch', () => {
    vi.spyOn(api, 'apiGet').mockReturnValue(new Promise(() => {}));
    renderWithProviders(<AuditPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
