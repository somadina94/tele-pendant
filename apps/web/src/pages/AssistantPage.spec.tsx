import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { AssistantPage } from './AssistantPage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

describe('AssistantPage', () => {
  it('asks and shows answer', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      docsRoot: 'docs',
      docsLink: '',
      indexed: 5,
      cursorConfigured: false,
    });
    vi.spyOn(api, 'apiPost').mockResolvedValue({
      answer: 'comms lost',
      note: 'local',
    });
    renderWithProviders(<AssistantPage />);
    expect(await screen.findByText(/Indexed documents: 5/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() =>
      expect(screen.getByText(/comms lost/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/\(local\)/)).toBeInTheDocument();
  });

  it('shows error paths', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      docsRoot: 'docs',
      docsLink: 'https://example.com/docs',
      indexed: 1,
      cursorConfigured: true,
    });
    vi.spyOn(api, 'apiPost').mockRejectedValueOnce(new Error('down'));
    renderWithProviders(<AssistantPage />);
    expect(await screen.findByRole('link', { name: /Open docs/i })).toHaveAttribute(
      'href',
      'https://example.com/docs',
    );
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('down')).toBeInTheDocument();

    vi.spyOn(api, 'apiPost').mockRejectedValueOnce('x');
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Ask failed')).toBeInTheDocument();
  });

  it('saves settings and reindexes', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      docsRoot: 'docs',
      docsLink: '',
      indexed: 2,
      cursorConfigured: false,
    });
    const put = vi.spyOn(api, 'apiPut').mockResolvedValue({
      docsRoot: 'manuals',
      docsLink: 'https://docs.example',
      indexed: 9,
      cursorConfigured: true,
    });
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({ indexed: 9 });
    renderWithProviders(<AssistantPage />);
    await screen.findByDisplayValue('docs');
    fireEvent.change(screen.getByLabelText('Docs root path'), {
      target: { value: 'manuals' },
    });
    fireEvent.change(screen.getByLabelText('Docs link (URL)'), {
      target: { value: 'https://docs.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/assistant/settings', {
        docsRoot: 'manuals',
        docsLink: 'https://docs.example',
      }),
    );
    expect(await screen.findByText(/Indexed documents: 9/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reindex' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/assistant/reindex'),
    );
  });

  it('toasts settings and reindex failures', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValueOnce(new Error('no settings'));
    const put = vi
      .spyOn(api, 'apiPut')
      .mockRejectedValueOnce(new Error('denied'))
      .mockRejectedValueOnce('save-nope');
    const post = vi
      .spyOn(api, 'apiPost')
      .mockRejectedValueOnce('nope')
      .mockRejectedValueOnce(new Error('reindex boom'));
    renderWithProviders(<AssistantPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Reindex' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Reindex' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  });

  it('shows cursor mode note when ask returns a mode', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      docsRoot: 'docs',
      docsLink: '',
      indexed: 3,
      cursorConfigured: true,
    });
    vi.spyOn(api, 'apiPost').mockResolvedValue({
      answer: 'Hold deadman',
      note: 'Cursor Agent',
      mode: 'cursor',
    });
    renderWithProviders(<AssistantPage />);
    expect(
      await screen.findByText(/Cursor Agent is configured/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText(/· cursor/)).toBeInTheDocument();
  });
});
