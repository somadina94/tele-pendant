import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageSpinner({
  className,
  label = 'Loading',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 text-muted-foreground',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <Loader2 className="size-8 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
