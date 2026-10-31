import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { AssistantPage } from './AssistantPage';
import { renderWithProviders } from '../test/render';
import * as api from '../lib/api';

describe('AssistantPage', () => {
  it('asks and shows answer', async () => {
    vi.spyOn(api, 'apiPost').mockResolvedValue({
      answer: 'comms lost',
      note: 'local',
    });
    renderWithProviders(<AssistantPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() =>
      expect(screen.getByText(/comms lost/)).toBeInTheDocument(),
    );
  });

  it('shows error paths', async () => {
    vi.spyOn(api, 'apiPost').mockRejectedValueOnce(new Error('down'));
    renderWithProviders(<AssistantPage />);
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('down')).toBeInTheDocument();

    vi.spyOn(api, 'apiPost').mockRejectedValueOnce('x');
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Ask failed')).toBeInTheDocument();
  });
});
