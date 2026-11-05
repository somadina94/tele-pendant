import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { formatAuditDateParam } from '@/lib/audit-api';
import { cn } from '@/lib/utils';

export function AuditDateField({
  id,
  label,
  value,
  onChange,
  placeholder = 'Pick a date',
}: {
  id: string;
  label: string;
  value?: string;
  onChange: (next: string | undefined) => void;
  placeholder?: string;
}) {
  const selected = value ? new Date(`${value}T12:00:00.000Z`) : undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="size-4" />
            {value ? format(selected!, 'PPP') : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(day) =>
              onChange(day ? formatAuditDateParam(day) : undefined)
            }
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
