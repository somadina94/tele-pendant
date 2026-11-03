import { cn } from '@/lib/utils';

type BrandMarkProps = {
  className?: string;
  alt?: string;
};

export function BrandMark({ className, alt = 'Tele-Pendant' }: BrandMarkProps) {
  return (
    <img
      src="/brand/mark.svg"
      alt={alt}
      className={cn('size-8 shrink-0 rounded-md', className)}
    />
  );
}

export function BrandLockup({
  className,
  subtitle = 'HMI',
}: {
  className?: string;
  subtitle?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <BrandMark />
      <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate font-semibold tracking-wide">
          Tele-Pendant
        </span>
        <span className="truncate text-xs uppercase tracking-[0.18em] text-sidebar-foreground/70">
          {subtitle}
        </span>
      </div>
    </div>
  );
}
