import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { AuditDateField } from './audit-date-field';
import { renderWithProviders } from '../test/render';

describe('AuditDateField', () => {
  it('opens the calendar popover', () => {
    renderWithProviders(
      <AuditDateField
        id="from"
        label="From"
        value={undefined}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Pick a date'));
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('shows a formatted value when set', () => {
    renderWithProviders(
      <AuditDateField
        id="to"
        label="To"
        value="2026-01-15"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/January/i)).toBeInTheDocument();
  });
});
