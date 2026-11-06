import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ConfigScanCodesSection } from './config-scan-codes-section';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

vi.mock('@/lib/toast', () => ({
  toastErr: vi.fn(),
  toastOk: vi.fn(),
}));

describe('ConfigScanCodesSection', () => {
  it('creates and updates codes', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([
      {
        id: '1',
        code: 'A',
        label: 'Alpha',
        kind: 'asset',
        routeHint: '/operator',
        notes: '',
      },
    ]);
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({});
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({});
    renderWithProviders(<ConfigScanCodesSection />);
    await screen.findByDisplayValue('A');
    fireEvent.change(screen.getByDisplayValue('Alpha'), {
      target: { value: 'Alpha updated' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save A/i }));
    await waitFor(() => expect(patch).toHaveBeenCalled());

    const payloadInputs = screen.getAllByPlaceholderText('TP-CRANE-DEMO-01');
    fireEvent.change(payloadInputs[payloadInputs.length - 1]!, {
      target: { value: 'NEW-CODE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add code/i }));
    await waitFor(() => expect(post).toHaveBeenCalled());
  });

  it('deletes a registered code after confirmation', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([
      {
        id: '1',
        code: 'A',
        label: 'Alpha',
        kind: 'asset',
        routeHint: '',
        notes: '',
      },
    ]);
    const del = vi.spyOn(api, 'apiDelete').mockResolvedValue({});
    renderWithProviders(<ConfigScanCodesSection />);
    await screen.findByDisplayValue('A');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/media/codes/1'));
  });

  it('handles invalid payloads and save failures', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue(null as never);
    renderWithProviders(<ConfigScanCodesSection />);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Save/i }),
      ).not.toBeInTheDocument(),
    );

    vi.spyOn(api, 'apiGet').mockResolvedValue([
      {
        id: '1',
        code: 'A',
        label: 'Alpha',
        kind: 'asset',
        routeHint: '',
        notes: '',
      },
    ]);
    vi.spyOn(api, 'apiPatch').mockRejectedValue('bad');
    renderWithProviders(<ConfigScanCodesSection />);
    await screen.findByDisplayValue('A');
    fireEvent.click(screen.getByRole('button', { name: /Save A/i }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('Save failed'));
  });
});
