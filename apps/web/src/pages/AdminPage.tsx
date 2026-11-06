import { FormEvent, useEffect, useId, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  HmiLayout,
  RegisterRef,
} from '@/lib/api';
import { useT } from '@/lib/i18n';
import { HelpTip } from '@/lib/tour';
import { toastErr, toastOk } from '@/lib/toast';
import { PageSpinner } from '@/components/page-spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ConfigScanCodesSection } from '@/components/config-scan-codes-section';
import { ConfigUsersSection } from '@/components/config-users-section';
import { canManageUsers, configSectionIdsForRole } from '@tele-pendant/shared';
import {
  parseConfigSection,
  type ConfigSectionId,
} from '@/lib/config-sections';
import { useConfirmDialog } from '@/lib/confirm-dialog';
import { useDeleteConfirmDialog } from '@/lib/delete-confirm';
import { getStoredUserRole } from '@/lib/user-session';

interface PlcConnectionRow {
  id: string;
  label: string;
  host: string;
  port: number;
  unitId?: number;
  enabled: boolean;
  isSimulator: boolean;
  protocol?: 'modbus-tcp' | 'opcua';
}

interface PlcHealth {
  connected: boolean;
  connectionId: string | null;
  label: string | null;
  host: string | null;
  port: number | null;
  lastError: string | null;
}

interface ConnectionInput {
  label: string;
  host: string;
  port: number;
  unitId: number;
  enabled: boolean;
  protocol: 'modbus-tcp' | 'opcua';
}

interface AlarmDefinitionRow {
  id: string;
  name: string;
  severity: string;
  compareOp: string;
  threshold: number;
  enabled: boolean;
  register?: { id: string; name: string } | null;
}

interface SafetyRoleRow {
  eStopRegisterId?: string | null;
  deadmanRegisterId?: string | null;
  heartbeatRegisterId?: string | null;
  safeStateRegisterId?: string | null;
  allowTimedMediaMotion?: boolean;
}

interface Note {
  ok: boolean;
  text: string;
}

function noteText(err: unknown): string {
  return err instanceof Error ? err.message : 'Save failed';
}

function isProtectedStopCell(style: string, label: string): boolean {
  return style === 'estop' || label.trim().toUpperCase() === 'STOP';
}

function StatusNote({ note }: { note?: Note | null }) {
  if (!note) return null;
  return (
    <Alert variant={note.ok ? 'default' : 'destructive'}>
      {!note.ok ? <AlertCircle className="h-4 w-4" /> : null}
      <AlertDescription>{note.text}</AlertDescription>
    </Alert>
  );
}

function PlcConnectionStatus({
  connectionId,
  inUse,
  health,
}: {
  connectionId: string;
  inUse: boolean;
  health?: PlcHealth | null;
}) {
  if (!inUse) return null;
  const wrap = (node: ReactNode) => (
    <div className="w-fit max-w-full justify-self-start">{node}</div>
  );

  if (!health) {
    return wrap(
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 shrink-0 animate-spin" />
        Checking connection…
      </span>,
    );
  }
  if (health.connectionId !== connectionId) {
    return wrap(
      <Badge variant="secondary" className="w-fit">
        Standby — another PLC is active
      </Badge>,
    );
  }
  if (health.connected) {
    return wrap(
      <Badge className="w-fit border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
        Connected
      </Badge>,
    );
  }
  return wrap(
    <span className="block text-sm text-destructive">
      Not connected
      {health.lastError ? `: ${health.lastError}` : ''}
    </span>,
  );
}

const selectTriggerClassName =
  'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

function AdminSelect({
  label,
  value,
  onChange,
  ariaLabel,
  options,
  allowEmpty = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
  className?: string;
}) {
  const controlId = useId();
  const labeledByVisibleLabel = label === ariaLabel;

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={labeledByVisibleLabel ? controlId : undefined}>
        {label}
      </Label>
      <select
        id={labeledByVisibleLabel ? controlId : undefined}
        aria-label={labeledByVisibleLabel ? undefined : ariaLabel}
        className={selectTriggerClassName}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowEmpty ? <option value="">—</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const { t } = useT();
  const [searchParams] = useSearchParams();
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [labelFormKey, setLabelFormKey] = useState(0);
  const layoutQuery = useQuery({
    queryKey: ['hmi-layout'],
    queryFn: () => apiGet<HmiLayout>('/hmi/layout'),
  });
  const connections = useQuery({
    queryKey: ['plc-connections'],
    queryFn: () => apiGet<PlcConnectionRow[]>('/plc/connections'),
  });
  const plcHealth = useQuery({
    queryKey: ['plc-health'],
    queryFn: () => apiGet<PlcHealth>('/plc/health'),
    refetchInterval: 2000,
  });
  const alarmDefs = useQuery({
    queryKey: ['alarm-definitions'],
    queryFn: async () => {
      const rows = await apiGet<unknown>('/alarms/definitions');
      return Array.isArray(rows) ? (rows as AlarmDefinitionRow[]) : [];
    },
  });
  const safetyRoles = useQuery({
    queryKey: ['safety-roles'],
    queryFn: async () => {
      const row = await apiGet<SafetyRoleRow | null>('/safety/roles');
      return row && 'eStopRegisterId' in row ? row : null;
    },
  });

  function remember(key: string, note: Note) {
    setNotes((current) => ({ ...current, [key]: note }));
  }

  async function saveConnection(id: string | null, value: ConnectionInput) {
    if (id) {
      await apiPatch(`/plc/connections/${id}`, value);
    } else {
      await apiPost('/plc/connections', value);
    }
    await queryClient.invalidateQueries({ queryKey: ['plc-connections'] });
    await queryClient.invalidateQueries({ queryKey: ['plc-health'] });
  }

  async function saveRegister(
    id: string,
    value: { address: number; trended: boolean; nodeId?: string },
  ) {
    await apiPatch(`/hmi/registers/${id}`, value);
    await queryClient.invalidateQueries({ queryKey: ['hmi-layout'] });
  }

  async function refreshLayout() {
    await queryClient.invalidateQueries({ queryKey: ['hmi-layout'] });
  }

  if (layoutQuery.isLoading || connections.isLoading) {
    return <PageSpinner label={t('hmiConfig')} />;
  }

  const layout = layoutQuery.data;
  const registers = layout?.registers ?? [];
  const plcRows = connections.data ?? [];
  const cells = layout?.cells ?? [];
  const overlays = layout?.overlays ?? [];
  const alarms = alarmDefs.data ?? [];

  const role = getStoredUserRole() ?? 'supervisor';
  const showUsers = canManageUsers(role);
  const allowedSections = new Set(
    configSectionIdsForRole(role),
  ) as Set<ConfigSectionId>;
  const section = parseConfigSection(
    searchParams.get('section'),
    showUsers,
    allowedSections,
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {section === 'plc' ? (
        <p className="text-sm text-muted-foreground">
          These fields are saved in SQLite. Check <strong>Use this PLC</strong>{' '}
          and press <strong>Save</strong> to connect. Each register address is
          the Modbus number the buttons and safety checks use.
        </p>
      ) : null}
      {section === 'codes' ? (
        <p className="text-sm text-muted-foreground">
          QR and barcodes must match the <strong>Code</strong> text exactly (not
          a URL unless you register that URL). Operators resolve codes on{' '}
          <strong>Media</strong>; optional <strong>Route hint</strong> sends
          them to a screen after a successful scan.
        </p>
      ) : null}

      <div className={cn(section !== 'users' && 'hidden')}>
        {showUsers ? <ConfigUsersSection /> : null}
      </div>

      <div className={cn(section !== 'plc' && 'hidden')}>
        <HelpTip id="tour.config.plc">
          <Card>
            <CardHeader>
              <CardTitle>{t('plcConnections')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {plcRows.map((row) => (
                <ConnectionEditor
                  key={row.id}
                  connectionId={row.id}
                  plcHealth={plcHealth.data}
                  noteKey={row.id}
                  initial={{
                    label: row.label,
                    host: row.host,
                    port: row.port,
                    unitId: row.unitId ?? 1,
                    enabled: row.enabled,
                    protocol: row.protocol ?? 'modbus-tcp',
                    isSimulator: row.isSimulator,
                  }}
                  submitLabel={`Save ${row.label}`}
                  note={notes[row.id]}
                  onNote={(note) => remember(row.id, note)}
                  onSubmit={(value) => saveConnection(row.id, value)}
                />
              ))}
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Add a PLC</h3>
                <ConnectionEditor
                  plcHealth={plcHealth.data}
                  noteKey="new"
                  initial={{
                    label: '',
                    host: '',
                    port: 502,
                    unitId: 1,
                    enabled: false,
                    protocol: 'modbus-tcp',
                    isSimulator: false,
                  }}
                  submitLabel="Add PLC"
                  note={notes.new}
                  onNote={(note) => remember('new', note)}
                  onSubmit={(value) => saveConnection(null, value)}
                />
              </div>
            </CardContent>
          </Card>
        </HelpTip>
      </div>

      <div className={cn(section !== 'registers' && 'hidden')}>
        <HelpTip id="tour.config.registers">
          <Card>
            <CardHeader>
              <CardTitle>{t('registerMaps')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {registers.map((row) => (
                <RegisterEditor
                  key={row.id}
                  name={row.name}
                  kind={row.kind}
                  address={row.address}
                  trended={Boolean(row.trended)}
                  nodeId={row.nodeId ?? ''}
                  showNode={plcRows.some((item) => item.protocol === 'opcua')}
                  note={notes[row.id]}
                  onNote={(note) => remember(row.id, note)}
                  onSubmit={(value) => saveRegister(row.id, value)}
                />
              ))}
            </CardContent>
          </Card>
        </HelpTip>
      </div>

      <div className={cn(section !== 'cells' && 'hidden')}>
        <HelpTip id="tour.config.cells">
          <Card>
            <CardHeader>
              <CardTitle>{t('cellsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {cells.map((cell) => (
                <CellEditor
                  key={cell.id}
                  noteKey={cell.id}
                  registers={registers}
                  initial={{
                    row: cell.row,
                    col: cell.col,
                    label: cell.label,
                    style: cell.style,
                    isMotion: cell.isMotion,
                    requiresSafeAction: cell.requiresSafeAction,
                    primaryRegisterId: cell.primaryRegister?.id ?? '',
                    feedbackRegisterId: cell.feedbackRegister?.id ?? '',
                    statusRegisterId: cell.statusRegister?.id ?? '',
                  }}
                  submitLabel={`Save ${cell.label}`}
                  note={notes[cell.id]}
                  onNote={(note) => remember(cell.id, note)}
                  onSubmit={(value) =>
                    apiPatch(`/hmi/cells/${cell.id}`, value).then(() =>
                      refreshLayout(),
                    )
                  }
                  onDelete={() =>
                    apiDelete(`/hmi/cells/${cell.id}`).then(() =>
                      refreshLayout(),
                    )
                  }
                />
              ))}
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Add a cell</h3>
                <CellEditor
                  noteKey="new-cell"
                  registers={registers}
                  initial={{
                    row: 0,
                    col: 0,
                    label: '',
                    style: 'default',
                    isMotion: false,
                    requiresSafeAction: false,
                    primaryRegisterId: registers[0]?.id ?? '',
                    feedbackRegisterId: '',
                    statusRegisterId: '',
                  }}
                  submitLabel="Add cell"
                  note={notes['new-cell']}
                  onNote={(note) => remember('new-cell', note)}
                  onSubmit={(value) =>
                    apiPost('/hmi/cells', value).then(() => refreshLayout())
                  }
                />
              </div>
            </CardContent>
          </Card>
        </HelpTip>
      </div>

      <div className={cn(section !== 'labels' && 'hidden')}>
        <HelpTip id="tour.config.labels">
          <Card>
            <CardHeader>
              <CardTitle>Live labels</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {overlays.map((overlay) => (
                <OverlayEditor
                  key={overlay.id}
                  noteKey={overlay.id}
                  registers={registers}
                  initial={{
                    label: overlay.label,
                    xPct: overlay.xPct,
                    yPct: overlay.yPct,
                    format: overlay.format,
                    registerId: overlay.register?.id ?? '',
                  }}
                  submitLabel={`Save ${overlay.label}`}
                  note={notes[overlay.id]}
                  onNote={(note) => remember(overlay.id, note)}
                  onSubmit={(value) =>
                    apiPatch(`/hmi/overlays/${overlay.id}`, value).then(() =>
                      refreshLayout(),
                    )
                  }
                  onDelete={() =>
                    apiDelete(`/hmi/overlays/${overlay.id}`).then(() =>
                      refreshLayout(),
                    )
                  }
                />
              ))}
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Add a label</h3>
                <OverlayEditor
                  key={labelFormKey}
                  noteKey="new-label"
                  registers={registers}
                  initial={{
                    label: '',
                    xPct: 10,
                    yPct: 10,
                    format: '{value}',
                    registerId: '',
                  }}
                  submitLabel="Add label"
                  note={notes['new-label']}
                  onNote={(note) => remember('new-label', note)}
                  onSubmit={(value) =>
                    apiPost('/hmi/overlays', value).then(() => {
                      setLabelFormKey((current) => current + 1);
                      return refreshLayout();
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </HelpTip>
      </div>

      <div className={cn(section !== 'background' && 'hidden')}>
        <HelpTip id="tour.config.background">
          <Card>
            <CardHeader>
              <CardTitle>Background</CardTitle>
            </CardHeader>
            <CardContent>
              {layout?.background ? (
                <BackgroundEditor
                  initial={{
                    name: layout.background.name,
                    cssBackground: layout.background.cssBackground ?? '',
                    imageUrl: layout.background.imageUrl ?? '',
                  }}
                  note={notes.background}
                  onNote={(note) => remember('background', note)}
                  onSubmit={(value) =>
                    apiPatch('/hmi/background', value).then(() =>
                      refreshLayout(),
                    )
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No active background
                </p>
              )}
            </CardContent>
          </Card>
        </HelpTip>
      </div>

      <div className={cn(section !== 'codes' && 'hidden')}>
        <HelpTip id="tour.config.codes">
          <ConfigScanCodesSection />
        </HelpTip>
      </div>

      <div className={cn(section !== 'alarms' && 'hidden')}>
        <HelpTip id="tour.config.alarms">
          <AlarmSection registers={registers} definitions={alarms} />
        </HelpTip>
      </div>

      <div className={cn(section !== 'safety' && 'hidden')}>
        <HelpTip id="tour.config.safety">
          <SafetySection
            registers={registers}
            roles={safetyRoles.data ?? null}
          />
        </HelpTip>
      </div>
    </div>
  );
}

function AlarmSection({
  registers,
  definitions,
}: {
  registers: RegisterRef[];
  definitions: AlarmDefinitionRow[];
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [registerId, setRegisterId] = useState(registers[0]?.id ?? '');
  const [compareOp, setCompareOp] = useState('gt');
  const [threshold, setThreshold] = useState('1');
  const [severity, setSeverity] = useState('warning');
  const [enabled, setEnabled] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const enabledId = useId();
  const { askDelete, deleteConfirmDialog } = useDeleteConfirmDialog();

  function resetForm() {
    setName('');
    setCompareOp('gt');
    setThreshold('1');
    setSeverity('warning');
    setEnabled(true);
    setEditingId(null);
    setRegisterId(registers[0]?.id ?? '');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = {
      name,
      registerId,
      compareOp,
      threshold: Number(threshold),
      severity,
      enabled,
    };
    try {
      if (editingId) {
        await apiPatch(`/alarms/definitions/${editingId}`, body);
      } else {
        await apiPost('/alarms/definitions', body);
      }
      await queryClient.invalidateQueries({ queryKey: ['alarm-definitions'] });
      const success = { ok: true as const, text: 'Saved alarm.' };
      setNote(success);
      toastOk(success.text);
      resetForm();
    } catch (err) {
      const failure = { ok: false as const, text: noteText(err) };
      setNote(failure);
      toastErr(failure.text);
    }
  }

  async function remove(id: string) {
    try {
      await apiDelete(`/alarms/definitions/${id}`);
      await queryClient.invalidateQueries({ queryKey: ['alarm-definitions'] });
      const success = { ok: true as const, text: 'Deleted alarm.' };
      setNote(success);
      toastOk(success.text);
      if (editingId === id) resetForm();
    } catch (err) {
      const failure = { ok: false as const, text: noteText(err) };
      setNote(failure);
      toastErr(failure.text);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('alarmDefinitions')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {definitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noAlarmDefs')}</p>
        ) : null}
        {definitions.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{row.name}</span>
              <Badge variant="secondary">
                {row.register?.name ?? row.compareOp}
              </Badge>
              <span>{row.threshold}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingId(row.id);
                setName(row.name);
                setRegisterId(row.register?.id ?? registers[0]?.id ?? '');
                setCompareOp(row.compareOp);
                setThreshold(String(row.threshold));
                setSeverity(row.severity || 'warning');
                setEnabled(row.enabled);
              }}
            >
              Edit {row.name}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => askDelete(row.name, () => remove(row.id))}
            >
              <Trash2 />
              {t('delete')} {row.name}
            </Button>
          </div>
        ))}
        {deleteConfirmDialog}
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-2">
            <Label htmlFor="alarm-name">Name</Label>
            <Input
              id="alarm-name"
              aria-label="alarm name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <AdminSelect
            label="Register"
            ariaLabel="alarm register"
            value={registerId}
            onChange={setRegisterId}
            options={registers.map((row) => ({
              value: row.id,
              label: row.name,
            }))}
          />
          <AdminSelect
            label="Operator"
            ariaLabel="alarm operator"
            value={compareOp}
            onChange={setCompareOp}
            options={[
              { value: 'eq', label: 'eq' },
              { value: 'gt', label: 'gt' },
              { value: 'lt', label: 'lt' },
              { value: 'neq', label: 'neq' },
            ]}
          />
          <div className="grid gap-2">
            <Label htmlFor="alarm-threshold">Threshold</Label>
            <Input
              id="alarm-threshold"
              aria-label="alarm threshold"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
            />
          </div>
          <AdminSelect
            label="Severity"
            ariaLabel="alarm severity"
            value={severity}
            onChange={setSeverity}
            options={[
              { value: 'info', label: 'info' },
              { value: 'warning', label: 'warning' },
              { value: 'critical', label: 'critical' },
            ]}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id={enabledId}
              aria-label="alarm enabled"
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked === true)}
            />
            <Label htmlFor={enabledId}>Enabled</Label>
          </div>
          <Button type="submit">
            <Save />
            {t('saveAlarm')}
          </Button>
          <StatusNote note={note} />
        </form>
      </CardContent>
    </Card>
  );
}

function SafetySection({
  registers,
  roles,
}: {
  registers: RegisterRef[];
  roles: SafetyRoleRow | null;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SafetyRoleRow>({});
  const eStopRegisterId = draft.eStopRegisterId ?? roles?.eStopRegisterId ?? '';
  const deadmanRegisterId =
    draft.deadmanRegisterId ?? roles?.deadmanRegisterId ?? '';
  const heartbeatRegisterId =
    draft.heartbeatRegisterId ?? roles?.heartbeatRegisterId ?? '';
  const safeStateRegisterId =
    draft.safeStateRegisterId ?? roles?.safeStateRegisterId ?? '';
  const allowTimedMediaMotion =
    draft.allowTimedMediaMotion ?? roles?.allowTimedMediaMotion ?? false;
  const timedId = useId();
  const [note, setNote] = useState<Note | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await apiPut('/safety/roles', {
        eStopRegisterId,
        deadmanRegisterId,
        heartbeatRegisterId,
        safeStateRegisterId,
        allowTimedMediaMotion,
      });
      await queryClient.invalidateQueries({ queryKey: ['safety-roles'] });
      const success = { ok: true as const, text: 'Saved safety roles.' };
      setNote(success);
      toastOk(success.text);
    } catch (err) {
      const failure = { ok: false as const, text: noteText(err) };
      setNote(failure);
      toastErr(failure.text);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('safetyRoles')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <RoleSelect
            label="E-stop"
            value={eStopRegisterId}
            registers={registers}
            onChange={(value) =>
              setDraft((current) => ({ ...current, eStopRegisterId: value }))
            }
          />
          <RoleSelect
            label="Deadman"
            value={deadmanRegisterId}
            registers={registers}
            onChange={(value) =>
              setDraft((current) => ({ ...current, deadmanRegisterId: value }))
            }
          />
          <RoleSelect
            label="Heartbeat"
            value={heartbeatRegisterId}
            registers={registers}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                heartbeatRegisterId: value,
              }))
            }
          />
          <RoleSelect
            label="Safe state"
            value={safeStateRegisterId}
            registers={registers}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                safeStateRegisterId: value,
              }))
            }
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id={timedId}
              aria-label="allow timed media motion"
              checked={allowTimedMediaMotion}
              onCheckedChange={(checked) =>
                setDraft((current) => ({
                  ...current,
                  allowTimedMediaMotion: checked === true,
                }))
              }
            />
            <Label htmlFor={timedId}>{t('allowTimedMedia')}</Label>
          </div>
          <Button type="submit">
            <Save />
            {t('saveSafety')}
          </Button>
          <StatusNote note={note} />
        </form>
      </CardContent>
    </Card>
  );
}

function RoleSelect({
  label,
  value,
  registers,
  onChange,
}: {
  label: string;
  value: string;
  registers: RegisterRef[];
  onChange: (value: string) => void;
}) {
  return (
    <AdminSelect
      label={label}
      ariaLabel={label}
      value={value}
      onChange={onChange}
      allowEmpty
      options={registers.map((row) => ({ value: row.id, label: row.name }))}
    />
  );
}

function ConnectionEditor({
  connectionId,
  noteKey,
  initial,
  submitLabel,
  note,
  onNote,
  onSubmit,
  plcHealth,
}: {
  connectionId?: string;
  noteKey: string;
  initial: ConnectionInput & { isSimulator: boolean };
  submitLabel: string;
  note?: Note;
  onNote: (note: Note) => void;
  onSubmit: (value: ConnectionInput) => Promise<void>;
  plcHealth?: PlcHealth | null;
}) {
  const [label, setLabel] = useState(initial.label);
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(String(initial.port));
  const [unitId, setUnitId] = useState(String(initial.unitId));
  const [protocol, setProtocol] = useState<'modbus-tcp' | 'opcua'>(
    initial.protocol,
  );
  const [enabled, setEnabled] = useState(initial.enabled);
  const usePlcId = useId();
  const { askConfirm, confirmDialog } = useConfirmDialog();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(initial.enabled);
  }, [initial.enabled]);

  async function saveConnection() {
    setBusy(true);
    try {
      await onSubmit({
        label,
        host,
        port: Number(port),
        unitId: Number(unitId),
        enabled,
        protocol,
      });
      const success = { ok: true as const, text: 'Saved.' };
      onNote(success);
      toastOk(enabled ? 'Saved. PLC connected.' : 'Saved.');
    } catch (err) {
      const failure = { ok: false as const, text: noteText(err) };
      onNote(failure);
      toastErr(failure.text);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (enabled) {
      askConfirm(
        'Use this PLC now?',
        'Any other connection will be turned off.',
        'Use this PLC',
        () => void saveConnection(),
      );
      return;
    }
    void saveConnection();
  }

  return (
    <form className="grid gap-4 rounded-lg border p-4" onSubmit={submit}>
      {confirmDialog}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{label || 'New connection'}</span>
        {initial.isSimulator ? (
          <Badge variant="secondary">simulator</Badge>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={`${noteKey}-label`}>Label</Label>
          <Input
            id={`${noteKey}-label`}
            aria-label={`${noteKey} label`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${noteKey}-host`}>Host</Label>
          <Input
            id={`${noteKey}-host`}
            aria-label={`${noteKey} host`}
            value={host}
            onChange={(event) => setHost(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${noteKey}-port`}>Port</Label>
          <Input
            id={`${noteKey}-port`}
            aria-label={`${noteKey} port`}
            value={port}
            onChange={(event) => setPort(event.target.value)}
            inputMode="numeric"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${noteKey}-unit`}>Unit id</Label>
          <Input
            id={`${noteKey}-unit`}
            aria-label={`${noteKey} unit`}
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            inputMode="numeric"
          />
        </div>
        <AdminSelect
          label="Protocol"
          ariaLabel={`${noteKey} protocol`}
          value={protocol}
          onChange={(value) =>
            setProtocol(value === 'opcua' ? 'opcua' : 'modbus-tcp')
          }
          options={[
            { value: 'modbus-tcp', label: 'Modbus TCP' },
            { value: 'opcua', label: 'OPC UA' },
          ]}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={usePlcId}
          aria-label={`${noteKey} use`}
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(checked === true)}
        />
        <Label htmlFor={usePlcId}>Use this PLC</Label>
      </div>
      {connectionId ? (
        <PlcConnectionStatus
          connectionId={connectionId}
          inUse={initial.enabled}
          health={plcHealth}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />}
          {submitLabel}
        </Button>
      </div>
      <StatusNote note={note} />
    </form>
  );
}

function RegisterEditor({
  name,
  kind,
  address,
  trended,
  nodeId,
  showNode,
  note,
  onNote,
  onSubmit,
}: {
  name: string;
  kind: string;
  address: number;
  trended: boolean;
  nodeId: string;
  showNode: boolean;
  note?: Note;
  onNote: (note: Note) => void;
  onSubmit: (value: {
    address: number;
    trended: boolean;
    nodeId?: string;
  }) => Promise<void>;
}) {
  const { t } = useT();
  const [value, setValue] = useState(String(address));
  const [trend, setTrend] = useState(trended);
  const [node, setNode] = useState(nodeId);
  const trendId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({
        address: Number(value),
        trended: trend,
        ...(showNode ? { nodeId: node } : {}),
      });
      const success = { ok: true as const, text: `Saved ${name}.` };
      onNote(success);
      toastOk(success.text);
    } catch (err) {
      const failure = { ok: false as const, text: noteText(err) };
      onNote(failure);
      toastErr(failure.text);
    }
  }

  return (
    <form
      className="grid gap-4 rounded-lg border p-4"
      onSubmit={(event) => void submit(event)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{name}</span>
        <Badge variant="outline">{kind}</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${name}-address`}>Address</Label>
          <Input
            id={`${name}-address`}
            aria-label={`${name} address`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            inputMode="numeric"
          />
        </div>
        {showNode ? (
          <div className="grid gap-2">
            <Label htmlFor={`${name}-node`}>Node id</Label>
            <Input
              id={`${name}-node`}
              aria-label={`${name} node`}
              value={node}
              onChange={(event) => setNode(event.target.value)}
            />
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={trendId}
          aria-label={`${name} trend`}
          checked={trend}
          onCheckedChange={(checked) => setTrend(checked === true)}
        />
        <Label htmlFor={trendId}>{t('trended')}</Label>
      </div>
      <Button type="submit">
        <Save />
        Save {name}
      </Button>
      <StatusNote note={note} />
    </form>
  );
}

interface RegisterOption {
  id: string;
  name: string;
}

interface CellForm {
  row: number;
  col: number;
  label: string;
  style: string;
  isMotion: boolean;
  requiresSafeAction: boolean;
  primaryRegisterId: string;
  feedbackRegisterId: string;
  statusRegisterId: string;
}

function RegisterSelect({
  label,
  value,
  registers,
  allowEmpty,
  onChange,
}: {
  label: string;
  value: string;
  registers: RegisterOption[];
  allowEmpty: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <AdminSelect
      label={allowEmpty ? `${label} (optional)` : label}
      ariaLabel={label}
      value={value}
      onChange={onChange}
      allowEmpty={allowEmpty}
      options={registers.map((register) => ({
        value: register.id,
        label: register.name,
      }))}
    />
  );
}

function CellEditor({
  noteKey,
  registers,
  initial,
  submitLabel,
  note,
  onNote,
  onSubmit,
  onDelete,
}: {
  noteKey: string;
  registers: RegisterOption[];
  initial: CellForm;
  submitLabel: string;
  note?: Note;
  onNote: (note: Note) => void;
  onSubmit: (value: CellForm) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [row, setRow] = useState(String(initial.row));
  const [col, setCol] = useState(String(initial.col));
  const [label, setLabel] = useState(initial.label);
  const [style, setStyle] = useState(initial.style);
  const [isMotion, setIsMotion] = useState(initial.isMotion);
  const [requiresSafeAction, setRequiresSafeAction] = useState(
    initial.requiresSafeAction,
  );
  const [primaryRegisterId, setPrimaryRegisterId] = useState(
    initial.primaryRegisterId,
  );
  const [feedbackRegisterId, setFeedbackRegisterId] = useState(
    initial.feedbackRegisterId,
  );
  const [statusRegisterId, setStatusRegisterId] = useState(
    initial.statusRegisterId,
  );
  const motionId = useId();
  const safeId = useId();
  const { askDelete, deleteConfirmDialog } = useDeleteConfirmDialog();

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({
        row: Number(row),
        col: Number(col),
        label,
        style,
        isMotion,
        requiresSafeAction,
        primaryRegisterId,
        feedbackRegisterId,
        statusRegisterId,
      });
      const success = {
        ok: true as const,
        text: `Saved ${label || 'cell'}.`,
      };
      onNote(success);
      toastOk(success.text);
    } catch (err) {
      const failure = { ok: false as const, text: noteText(err) };
      onNote(failure);
      toastErr(failure.text);
    }
  }

  function handleDelete() {
    const target = label || 'cell';
    askDelete(target, async () => {
      try {
        await onDelete!();
        toastOk(`Deleted ${target}.`);
      } catch (err) {
        const failure = { ok: false as const, text: noteText(err) };
        onNote(failure);
        toastErr(failure.text);
      }
    });
  }

  return (
    <form
      className="grid gap-4 rounded-lg border p-4"
      onSubmit={(event) => void submit(event)}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-2">
          <Label htmlFor={`${noteKey}-row`}>Row</Label>
          <Input
            id={`${noteKey}-row`}
            aria-label={`${noteKey} row`}
            value={row}
            onChange={(event) => setRow(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${noteKey}-col`}>Column</Label>
          <Input
            id={`${noteKey}-col`}
            aria-label={`${noteKey} col`}
            value={col}
            onChange={(event) => setCol(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${noteKey}-cell-label`}>Label</Label>
          <Input
            id={`${noteKey}-cell-label`}
            aria-label={`${noteKey} cell-label`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${noteKey}-style`}>Style</Label>
          <Input
            id={`${noteKey}-style`}
            aria-label={`${noteKey} style`}
            value={style}
            onChange={(event) => setStyle(event.target.value)}
          />
        </div>
      </div>
      <RegisterSelect
        label={`${noteKey} primary`}
        value={primaryRegisterId}
        registers={registers}
        allowEmpty={false}
        onChange={setPrimaryRegisterId}
      />
      <RegisterSelect
        label={`${noteKey} feedback`}
        value={feedbackRegisterId}
        registers={registers}
        allowEmpty
        onChange={setFeedbackRegisterId}
      />
      <RegisterSelect
        label={`${noteKey} status`}
        value={statusRegisterId}
        registers={registers}
        allowEmpty
        onChange={setStatusRegisterId}
      />
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id={motionId}
            aria-label={`${noteKey} motion`}
            checked={isMotion}
            onCheckedChange={(checked) => setIsMotion(checked === true)}
          />
          <Label htmlFor={motionId}>Motion</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={safeId}
            aria-label={`${noteKey} safe`}
            checked={requiresSafeAction}
            onCheckedChange={(checked) =>
              setRequiresSafeAction(checked === true)
            }
          />
          <Label htmlFor={safeId}>Safe action</Label>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">
          {submitLabel === 'Add cell' ? <Plus /> : <Save />}
          {submitLabel}
        </Button>
        {onDelete && !isProtectedStopCell(style, label) ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDelete()}
          >
            <Trash2 />
            Delete {label || 'cell'}
          </Button>
        ) : null}
      </div>
      {deleteConfirmDialog}
      <StatusNote note={note} />
    </form>
  );
}

interface OverlayForm {
  label: string;
  xPct: number;
  yPct: number;
  format: string;
  registerId: string;
}

function OverlayEditor({
  noteKey,
  registers,
  initial,
  submitLabel,
  note,
  onNote,
  onSubmit,
  onDelete,
}: {
  noteKey: string;
  registers: RegisterOption[];
  initial: OverlayForm;
  submitLabel: string;
  note?: Note;
  onNote: (note: Note) => void;
  onSubmit: (value: OverlayForm) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [label, setLabel] = useState(initial.label);
  const [xPct, setXPct] = useState(String(initial.xPct));
  const [yPct, setYPct] = useState(String(initial.yPct));
  const [format, setFormat] = useState(initial.format);
  const [registerId, setRegisterId] = useState(initial.registerId);
  const { askDelete, deleteConfirmDialog } = useDeleteConfirmDialog();

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({
        label,
        xPct: Number(xPct),
        yPct: Number(yPct),
        format,
        registerId,
      });
      const success = {
        ok: true as const,
        text: `Saved ${label || 'label'}.`,
      };
      onNote(success);
      toastOk(success.text);
    } catch (err) {
      const failure = { ok: false as const, text: noteText(err) };
      onNote(failure);
      toastErr(failure.text);
    }
  }

  function handleDelete() {
    const target = label || 'label';
    askDelete(target, async () => {
      try {
        await onDelete!();
        toastOk(`Deleted ${target}.`);
      } catch (err) {
        const failure = { ok: false as const, text: noteText(err) };
        onNote(failure);
        toastErr(failure.text);
      }
    });
  }

  return (
    <form
      className="grid gap-4 rounded-lg border p-4"
      onSubmit={(event) => void submit(event)}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-2">
          <Label htmlFor={`${noteKey}-overlay-label`}>Label</Label>
          <Input
            id={`${noteKey}-overlay-label`}
            aria-label={`${noteKey} overlay-label`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${noteKey}-x`}>X</Label>
          <Input
            id={`${noteKey}-x`}
            aria-label={`${noteKey} x`}
            value={xPct}
            onChange={(event) => setXPct(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${noteKey}-y`}>Y</Label>
          <Input
            id={`${noteKey}-y`}
            aria-label={`${noteKey} y`}
            value={yPct}
            onChange={(event) => setYPct(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${noteKey}-format`}>Format</Label>
          <Input
            id={`${noteKey}-format`}
            aria-label={`${noteKey} format`}
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          />
        </div>
      </div>
      <RegisterSelect
        label={`${noteKey} overlay-register`}
        value={registerId}
        registers={registers}
        allowEmpty
        onChange={setRegisterId}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit">
          {submitLabel.startsWith('Add') ? <Plus /> : <Save />}
          {submitLabel}
        </Button>
        {onDelete ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDelete()}
          >
            <Trash2 />
            Delete {label || 'label'}
          </Button>
        ) : null}
      </div>
      {deleteConfirmDialog}
      <StatusNote note={note} />
    </form>
  );
}

function BackgroundEditor({
  initial,
  note,
  onNote,
  onSubmit,
}: {
  initial: { name: string; cssBackground: string; imageUrl: string };
  note?: Note;
  onNote: (note: Note) => void;
  onSubmit: (value: {
    name: string;
    cssBackground: string;
    imageUrl: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [cssBackground, setCssBackground] = useState(initial.cssBackground);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    setImageBroken(false);
  }, [imageUrl]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({ name, cssBackground, imageUrl });
      const success = { ok: true as const, text: 'Saved background.' };
      onNote(success);
      toastOk(success.text);
    } catch (err) {
      const failure = { ok: false as const, text: noteText(err) };
      onNote(failure);
      toastErr(failure.text);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-2">
        <Label htmlFor="background-name">Name</Label>
        <Input
          id="background-name"
          aria-label="background name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="background-css">CSS background</Label>
        <Input
          id="background-css"
          aria-label="background css"
          value={cssBackground}
          onChange={(event) => setCssBackground(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="background-image">Image URL</Label>
        <Input
          id="background-image"
          aria-label="background image"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
          placeholder="https://images.example.com/bay.jpg"
        />
      </div>
      <CardDescription>
        Paste the image file address. A photo page such as unsplash.com/photos
        will not draw. Right-click the picture and copy the image address.
      </CardDescription>
      {imageUrl.trim() ? (
        <img
          className="max-h-48 rounded-md border object-contain"
          alt="Background preview"
          src={imageUrl.trim()}
          onError={() => setImageBroken(true)}
        />
      ) : null}
      {imageBroken ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This link did not load as a picture. Copy the image address, not the
            photo page.
          </AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit">
        <Save />
        Save background
      </Button>
      <StatusNote note={note} />
    </form>
  );
}
