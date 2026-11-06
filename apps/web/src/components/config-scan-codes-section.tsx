import { FormEvent, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, QrCode, Save, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { useDeleteConfirmDialog } from '@/lib/delete-confirm';
import { toastErr, toastOk } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const selectClassName =
  'flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

function ConfigSelect({
  label,
  value,
  onChange,
  options,
  allowEmpty,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={selectClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty ? <option value="">—</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface ScanCodeRow {
  id: string;
  code: string;
  label: string;
  kind: string;
  routeHint?: string | null;
  notes?: string | null;
}

const ROUTE_OPTIONS = [
  { value: '/operator', label: 'Operator' },
  { value: '/ops', label: 'Ops' },
  { value: '/media', label: 'Media' },
  { value: '/assistant', label: 'Assistant' },
  { value: '/face', label: 'Face' },
];

function ScanCodeEditor({
  initial,
  submitLabel,
  onSubmit,
  onDelete,
}: {
  initial: Omit<ScanCodeRow, 'id'> & { id?: string };
  submitLabel: string;
  onSubmit: (value: Omit<ScanCodeRow, 'id'>) => Promise<void>;
  onDelete?: () => void;
}) {
  const [code, setCode] = useState(initial.code);
  const [label, setLabel] = useState(initial.label);
  const [kind, setKind] = useState(initial.kind || 'asset');
  const [routeHint, setRouteHint] = useState(initial.routeHint ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit({
        code,
        label,
        kind,
        routeHint: routeHint.trim() || null,
        notes: notes.trim() || null,
      });
      toastOk('Scan code saved.');
    } catch (err) {
      toastErr(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={cn('grid gap-4 rounded-lg border p-4')}
      onSubmit={(e) => void submit(e)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${initial.code}-payload`}>
            QR / barcode payload
          </Label>
          <Input
            id={`${initial.code}-payload`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="TP-CRANE-DEMO-01"
          />
          <p className="text-xs text-muted-foreground">
            Exact text inside the QR (not a URL unless you register that URL).
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${initial.code}-label`}>Label</Label>
          <Input
            id={`${initial.code}-label`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <ConfigSelect
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'asset', label: 'Asset' },
            { value: 'shortcut', label: 'Shortcut' },
            { value: 'other', label: 'Other' },
          ]}
        />
        <ConfigSelect
          label="Open screen after scan"
          value={routeHint}
          onChange={setRouteHint}
          allowEmpty
          options={ROUTE_OPTIONS}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${initial.code}-notes`}>Notes (optional)</Label>
        <Input
          id={`${initial.code}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />}
          {submitLabel}
        </Button>
        {onDelete ? (
          <Button type="button" variant="destructive" onClick={onDelete}>
            <Trash2 />
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function ConfigScanCodesSection() {
  const queryClient = useQueryClient();
  const { askDelete, deleteConfirmDialog } = useDeleteConfirmDialog();
  const codes = useQuery({
    queryKey: ['scan-codes'],
    queryFn: () => apiGet<ScanCodeRow[]>('/media/codes'),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['scan-codes'] });
  }

  async function create(value: Omit<ScanCodeRow, 'id'>) {
    await apiPost('/media/codes', value);
    await refresh();
  }

  async function update(id: string, value: Omit<ScanCodeRow, 'id'>) {
    await apiPatch(`/media/codes/${id}`, value);
    await refresh();
  }

  return (
    <Card id="config-scan-codes">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="size-5" />
          QR / scan codes
        </CardTitle>
        <CardDescription>
          Register the exact string encoded in each QR or barcode. Operators
          resolve codes on Media; unknown payloads are rejected.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {codes.isError ? (
          <p className="text-sm text-destructive">
            {codes.error instanceof Error
              ? codes.error.message
              : 'Could not load codes'}
          </p>
        ) : null}
        {(Array.isArray(codes.data) ? codes.data : []).map((row) => (
          <ScanCodeEditor
            key={row.id}
            initial={row}
            submitLabel={`Save ${row.code}`}
            onSubmit={(value) => update(row.id, value)}
            onDelete={() =>
              askDelete(
                row.code,
                () =>
                  void apiDelete(`/media/codes/${row.id}`)
                    .then(refresh)
                    .then(() => toastOk('Deleted.'))
                    .catch((err: Error) => toastErr(err.message)),
              )
            }
          />
        ))}
        <Separator />
        <h3 className="text-sm font-medium">Add code</h3>
        <ScanCodeEditor
          initial={{
            code: '',
            label: '',
            kind: 'asset',
            routeHint: '/operator',
            notes: '',
          }}
          submitLabel="Add code"
          onSubmit={create}
        />
        {deleteConfirmDialog}
      </CardContent>
    </Card>
  );
}
