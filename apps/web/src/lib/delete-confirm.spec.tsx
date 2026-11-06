import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useDeleteConfirmDialog } from './delete-confirm';

function Probe() {
  const { askDelete, deleteConfirmDialog } = useDeleteConfirmDialog();
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          askDelete('item', () => {
            void 0;
          })
        }
      >
        Ask
      </button>
      {deleteConfirmDialog}
    </div>
  );
}

describe('useDeleteConfirmDialog', () => {
  it('opens an alert dialog and runs the action on confirm', () => {
    const run = vi.fn();
    function Host() {
      const { askDelete, deleteConfirmDialog } = useDeleteConfirmDialog();
      return (
        <div>
          <button type="button" onClick={() => askDelete('widget', run)}>
            Ask
          </button>
          {deleteConfirmDialog}
        </div>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete widget?');
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(run).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete',
      }),
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing', () => {
    render(<Probe />);
    expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();
  });
});
