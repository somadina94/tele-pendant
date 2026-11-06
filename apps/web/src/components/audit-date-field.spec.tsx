import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { AuditDateField } from './audit-date-field';
import { renderWithProviders } from '../test/render';

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
      <button type="button" onClick={() => onSelect?.(undefined)}>
        Clear day
      </button>
    </div>
  ),
}));

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

  it('calls onChange when a calendar day is selected', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <AuditDateField
        id="from"
        label="From"
        value={undefined}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('Pick a date'));
    fireEvent.click(screen.getByRole('button', { name: 'Pick stub day' }));
    expect(onChange).toHaveBeenCalledWith('2026-01-15');
  });

  it('clears the value when the picker sends an empty selection', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <AuditDateField
        id="from"
        label="From"
        value="2026-01-15"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText(/January/i));
    fireEvent.click(screen.getByRole('button', { name: 'Clear day' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
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
