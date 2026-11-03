import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { AssistantPage } from './AssistantPage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

async function expandDocsSettings() {
  fireEvent.click(
    await screen.findByRole('button', { name: /Docs settings/i }),
  );
}

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
    expect(screen.queryByText(/\(local\)/)).not.toBeInTheDocument();
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
    await expandDocsSettings();
    expect(
      await screen.findByRole('link', { name: /Open docs/i }),
    ).toHaveAttribute('href', 'https://example.com/docs');
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
    await expandDocsSettings();
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
    await expandDocsSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Reindex' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Reindex' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  });

  it('shows plain answer without note or markdown stars', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      docsRoot: 'docs',
      docsLink: '',
      indexed: 3,
      cursorConfigured: true,
    });
    vi.spyOn(api, 'apiPost').mockResolvedValue({
      answer: '**Hold** deadman *while* pressing.',
      note: 'Answered by Cursor Agent with local manuals + feature handbook.',
      mode: 'cursor',
    });
    renderWithProviders(<AssistantPage />);
    expect(
      await screen.findByText(/Cursor Agent is configured/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(
      await screen.findByText('Hold deadman while pressing.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/· cursor/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Answered by Cursor Agent/),
    ).not.toBeInTheDocument();
  });

  it('fills and asks from a suggested question', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      docsRoot: 'docs',
      docsLink: '',
      indexed: 4,
      cursorConfigured: false,
    });
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({
      answer: 'deadman pulses while pressed',
      note: 'local',
      mode: 'local-fts',
    });
    renderWithProviders(<AssistantPage />);
    expect(await screen.findByText('Suggested questions')).toBeInTheDocument();
    // safety group is open by default
    fireEvent.click(
      screen.getByRole('button', { name: 'How does deadman hold work?' }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/assistant/ask', {
        question: 'How does deadman hold work?',
      }),
    );
    expect(
      await screen.findByText(/deadman pulses while pressed/),
    ).toBeInTheDocument();
  });

  it('ignores blank ask submissions', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      docsRoot: 'docs',
      docsLink: '',
      indexed: 1,
      cursorConfigured: false,
    });
    const post = vi.spyOn(api, 'apiPost');
    renderWithProviders(<AssistantPage />);
    const question = await screen.findByLabelText('Question');
    fireEvent.change(question, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
    fireEvent.submit(question.closest('form')!);
    expect(post).not.toHaveBeenCalled();
  });

  it('ignores a second ask while busy', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      docsRoot: 'docs',
      docsLink: '',
      indexed: 2,
      cursorConfigured: false,
    });
    let resolveAsk!: (value: { answer: string; note: string }) => void;
    const post = vi.spyOn(api, 'apiPost').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAsk = resolve;
        }),
    );
    renderWithProviders(<AssistantPage />);
    const question = await screen.findByLabelText('Question');
    const form = question.closest('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    fireEvent.submit(form!);
    expect(post).toHaveBeenCalledTimes(1);
    resolveAsk({ answer: 'ok', note: 'local' });
    expect(await screen.findByText(/ok/)).toBeInTheDocument();
  });
});
