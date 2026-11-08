import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useConfirmDialog } from './confirm-dialog';

vi.mock('@/components/ui/alert-dialog', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/components/ui/alert-dialog')>();
  return {
    ...actual,
    AlertDialog: ({
      onOpenChange,
      open,
      children,
    }: {
      onOpenChange?: (open: boolean) => void;
      open: boolean;
      children: React.ReactNode;
    }) => (
      <actual.AlertDialog open={open} onOpenChange={onOpenChange}>
        {children}
        {open ? (
          <button type="button" onClick={() => onOpenChange?.(true)}>
            noop-open
          </button>
        ) : null}
      </actual.AlertDialog>
    ),
  };
});

function Probe() {
  const { askConfirm, confirmDialog } = useConfirmDialog();
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          askConfirm('Reset?', 'This cannot be undone.', 'Reset', () => {
            void 0;
          })
        }
      >
        Ask
      </button>
      {confirmDialog}
    </div>
  );
}

describe('useConfirmDialog', () => {
  it('runs the action on confirm and clears on dismiss', () => {
    const run = vi.fn();
    function Host() {
      const { askConfirm, confirmDialog } = useConfirmDialog();
      return (
        <div>
          <button
            type="button"
            onClick={() => askConfirm('Proceed?', 'Sure?', 'Continue', run)}
          >
            Ask
          </button>
          {confirmDialog}
        </div>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Proceed?');
    fireEvent.click(screen.getByText('noop-open'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(run).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Continue',
      }),
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing', () => {
    render(<Probe />);
    expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();
  });
});
