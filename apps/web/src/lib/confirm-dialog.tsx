import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function useConfirmDialog() {
  const [pending, setPending] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    run: () => void | Promise<void>;
  } | null>(null);

  function askConfirm(
    title: string,
    description: string,
    confirmLabel: string,
    run: () => void | Promise<void>,
  ) {
    setPending({ title, description, confirmLabel, run });
  }

  const confirmDialog = (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title ?? ''}</AlertDialogTitle>
          <AlertDialogDescription>
            {pending?.description ?? ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              const action = pending?.run;
              setPending(null);
              void action?.();
            }}
          >
            {pending?.confirmLabel ?? 'Continue'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { askConfirm, confirmDialog };
}
