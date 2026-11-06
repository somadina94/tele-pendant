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
  it('defaults null route hints in the editor state', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([
      {
        id: '1',
        code: 'A',
        label: 'Alpha',
        kind: 'asset',
        routeHint: null,
        notes: null,
      },
    ]);
    renderWithProviders(<ConfigScanCodesSection />);
    await screen.findByDisplayValue('A');
    expect(screen.getAllByLabelText('Open screen after scan')[0]).toHaveValue(
      '',
    );
  });

  it('clears optional route and notes on save', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([
      {
        id: '1',
        code: 'A',
        label: 'Alpha',
        kind: 'asset',
        routeHint: '/operator',
        notes: 'keep',
      },
    ]);
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({});
    renderWithProviders(<ConfigScanCodesSection />);
    await screen.findByDisplayValue('A');
    const routeSelect = screen.getAllByLabelText('Open screen after scan')[0]!;
    fireEvent.change(routeSelect, { target: { value: '' } });
    fireEvent.change(screen.getByDisplayValue('keep'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save A/i }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/media/codes/1', {
        code: 'A',
        label: 'Alpha',
        kind: 'asset',
        routeHint: null,
        notes: null,
      }),
    );
  });

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

  it('opens delete confirmation from the editor action', async () => {
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
    renderWithProviders(<ConfigScanCodesSection />);
    await screen.findByDisplayValue('A');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/Delete A\?/)).toBeInTheDocument();
  });

  it('surfaces delete failures from the editor', async () => {
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
    vi.spyOn(api, 'apiDelete').mockRejectedValue('bad');
    renderWithProviders(<ConfigScanCodesSection />);
    await screen.findByDisplayValue('A');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() => expect(toastErr).toHaveBeenCalled());
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

  it('keeps an explicit non-default kind on existing rows', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([
      {
        id: '1',
        code: 'A',
        label: 'Alpha',
        kind: 'shortcut',
        routeHint: '',
        notes: '',
      },
    ]);
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({});
    renderWithProviders(<ConfigScanCodesSection />);
    await screen.findByDisplayValue('A');
    fireEvent.click(screen.getByRole('button', { name: /Save A/i }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/media/codes/1',
        expect.objectContaining({ kind: 'shortcut' }),
      ),
    );
  });

  it('defaults null kind on existing rows', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([
      {
        id: '1',
        code: 'A',
        label: 'Alpha',
        kind: null,
        routeHint: '',
        notes: '',
      } as never,
    ]);
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({});
    renderWithProviders(<ConfigScanCodesSection />);
    await screen.findByDisplayValue('A');
    fireEvent.click(screen.getByRole('button', { name: /Save A/i }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/media/codes/1',
        expect.objectContaining({ kind: 'asset' }),
      ),
    );
  });

  it('defaults omitted kind on existing rows', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([
      {
        id: '1',
        code: 'A',
        label: 'Alpha',
        routeHint: '',
        notes: '',
      } as never,
    ]);
    const patch = vi.spyOn(api, 'apiPatch').mockResolvedValue({});
    renderWithProviders(<ConfigScanCodesSection />);
    await screen.findByDisplayValue('A');
    fireEvent.click(screen.getByRole('button', { name: /Save A/i }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/media/codes/1',
        expect.objectContaining({ kind: 'asset' }),
      ),
    );
  });

  it('defaults missing kind and surfaces Error save messages', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue([
      {
        id: '1',
        code: 'A',
        label: 'Alpha',
        kind: '',
        routeHint: '',
        notes: '',
      },
    ]);
    vi.spyOn(api, 'apiPatch').mockRejectedValue(new Error('save denied'));
    renderWithProviders(<ConfigScanCodesSection />);
    await screen.findByDisplayValue('A');
    fireEvent.click(screen.getByRole('button', { name: /Save A/i }));
    const { toastErr } = await import('@/lib/toast');
    await waitFor(() => expect(toastErr).toHaveBeenCalledWith('save denied'));
  });

  it('shows load errors', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(new Error('codes offline'));
    renderWithProviders(<ConfigScanCodesSection />);
    expect(await screen.findByText('codes offline')).toBeInTheDocument();
    vi.spyOn(api, 'apiGet').mockRejectedValue('nope');
    renderWithProviders(<ConfigScanCodesSection />);
    expect(await screen.findByText('Could not load codes')).toBeInTheDocument();
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
