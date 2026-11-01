import { FormEvent, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  HmiLayout,
  RegisterRef,
} from '../lib/api';
import { useT } from '../lib/i18n';

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
}

interface Note {
  ok: boolean;
  text: string;
}

function noteText(err: unknown): string {
  return err instanceof Error ? err.message : 'Save failed';
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const { t } = useT();
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const layoutQuery = useQuery({
    queryKey: ['hmi-layout'],
    queryFn: () => apiGet<HmiLayout>('/hmi/layout'),
  });
  const connections = useQuery({
    queryKey: ['plc-connections'],
    queryFn: () => apiGet<PlcConnectionRow[]>('/plc/connections'),
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

  const layout = layoutQuery.data;
  const registers = layout?.registers ?? [];
  const plcRows = connections.data ?? [];

  return (
    <main className="shell admin">
      <header className="op-header">
        <h1>{t('hmiConfig')}</h1>
        <Link to="/operator">{t('operator')}</Link>
      </header>
      <p className="lede">
        These fields are saved in SQLite. Check <strong>Use this PLC</strong>{' '}
        and press <strong>Save</strong> to connect. Each register address is the
        Modbus number the buttons and safety checks use.
      </p>

      <section>
        <h2>{t('plcConnections')}</h2>
        {(connections.data ?? []).map((row) => (
          <ConnectionEditor
            key={row.id}
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
        <h3>Add a PLC</h3>
        <ConnectionEditor
          noteKey="new"
          initial={{
            label: '',
            host: '',
            port: 502,
            unitId: 1,
            enabled: true,
            protocol: 'modbus-tcp',
            isSimulator: false,
          }}
          submitLabel="Add PLC"
          note={notes.new}
          onNote={(note) => remember('new', note)}
          onSubmit={(value) => saveConnection(null, value)}
        />
      </section>

      <section>
        <h2>{t('registerMaps')}</h2>
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
      </section>

      <section>
        <h2>{t('cellsTitle')}</h2>
        {(layout?.cells ?? []).map((cell) => (
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
              apiDelete(`/hmi/cells/${cell.id}`).then(() => refreshLayout())
            }
          />
        ))}
        <h3>Add a cell</h3>
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
      </section>

      <section>
        <h2>Live labels</h2>
        {(layout?.overlays ?? []).map((overlay) => (
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
        <h3>Add a label</h3>
        <OverlayEditor
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
            apiPost('/hmi/overlays', value).then(() => refreshLayout())
          }
        />
      </section>

      <section>
        <h2>Background</h2>
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
              apiPatch('/hmi/background', value).then(() => refreshLayout())
            }
          />
        ) : (
          <p>No active background</p>
        )}
      </section>

      <AlarmSection registers={registers} definitions={alarmDefs.data ?? []} />
      <SafetySection
        registers={registers}
        roles={safetyRoles.data ?? null}
      />
    </main>
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
  const [note, setNote] = useState<Note | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await apiPost('/alarms/definitions', {
        name,
        registerId,
        compareOp,
        threshold: Number(threshold),
        severity,
        enabled,
      });
      await queryClient.invalidateQueries({ queryKey: ['alarm-definitions'] });
      setNote({ ok: true, text: 'Saved alarm.' });
    } catch (err) {
      setNote({ ok: false, text: noteText(err) });
    }
  }

  async function remove(id: string) {
    try {
      await apiDelete(`/alarms/definitions/${id}`);
      await queryClient.invalidateQueries({ queryKey: ['alarm-definitions'] });
      setNote({ ok: true, text: 'Deleted alarm.' });
    } catch (err) {
      setNote({ ok: false, text: noteText(err) });
    }
  }

  return (
    <section>
      <h2>{t('alarmDefinitions')}</h2>
      {definitions.length === 0 ? <p>{t('noAlarmDefs')}</p> : null}
      {definitions.map((row) => (
        <p key={row.id}>
          {row.name} {row.compareOp} {row.threshold}
          <button type="button" onClick={() => void remove(row.id)}>
            {t('delete')} {row.name}
          </button>
        </p>
      ))}
      <form className="config-form" onSubmit={(event) => void submit(event)}>
        <label>
          Name
          <input
            aria-label="alarm name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Register
          <select
            aria-label="alarm register"
            value={registerId}
            onChange={(event) => setRegisterId(event.target.value)}
          >
            {registers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Operator
          <select
            aria-label="alarm operator"
            value={compareOp}
            onChange={(event) => setCompareOp(event.target.value)}
          >
            <option value="eq">eq</option>
            <option value="gt">gt</option>
            <option value="lt">lt</option>
            <option value="neq">neq</option>
          </select>
        </label>
        <label>
          Threshold
          <input
            aria-label="alarm threshold"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
          />
        </label>
        <label>
          Severity
          <input
            aria-label="alarm severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
          />
        </label>
        <label className="config-check">
          <input
            type="checkbox"
            aria-label="alarm enabled"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Enabled
        </label>
        <button type="submit">{t('saveAlarm')}</button>
        {note ? (
          <p className={note.ok ? 'status-line' : 'error'}>{note.text}</p>
        ) : null}
      </form>
    </section>
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
  const eStopRegisterId =
    draft.eStopRegisterId ?? roles?.eStopRegisterId ?? '';
  const deadmanRegisterId =
    draft.deadmanRegisterId ?? roles?.deadmanRegisterId ?? '';
  const heartbeatRegisterId =
    draft.heartbeatRegisterId ?? roles?.heartbeatRegisterId ?? '';
  const safeStateRegisterId =
    draft.safeStateRegisterId ?? roles?.safeStateRegisterId ?? '';
  const [note, setNote] = useState<Note | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await apiPut('/safety/roles', {
        eStopRegisterId,
        deadmanRegisterId,
        heartbeatRegisterId,
        safeStateRegisterId,
      });
      await queryClient.invalidateQueries({ queryKey: ['safety-roles'] });
      setNote({ ok: true, text: 'Saved safety roles.' });
    } catch (err) {
      setNote({ ok: false, text: noteText(err) });
    }
  }

  return (
    <section>
      <h2>{t('safetyRoles')}</h2>
      <form className="config-form" onSubmit={(event) => void submit(event)}>
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
            setDraft((current) => ({ ...current, heartbeatRegisterId: value }))
          }
        />
        <RoleSelect
          label="Safe state"
          value={safeStateRegisterId}
          registers={registers}
          onChange={(value) =>
            setDraft((current) => ({ ...current, safeStateRegisterId: value }))
          }
        />
        <button type="submit">{t('saveSafety')}</button>
        {note ? (
          <p className={note.ok ? 'status-line' : 'error'}>{note.text}</p>
        ) : null}
      </form>
    </section>
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
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">—</option>
        {registers.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
    </label>
  );
}


function ConnectionEditor({
  noteKey,
  initial,
  submitLabel,
  note,
  onNote,
  onSubmit,
}: {
  noteKey: string;
  initial: ConnectionInput & { isSimulator: boolean };
  submitLabel: string;
  note?: Note;
  onNote: (note: Note) => void;
  onSubmit: (value: ConnectionInput) => Promise<void>;
}) {
  const [label, setLabel] = useState(initial.label);
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(String(initial.port));
  const [unitId, setUnitId] = useState(String(initial.unitId));
  const [protocol, setProtocol] = useState<'modbus-tcp' | 'opcua'>(
    initial.protocol,
  );
  const [enabled, setEnabled] = useState(initial.enabled);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({
        label,
        host,
        port: Number(port),
        unitId: Number(unitId),
        enabled,
        protocol,
      });
      onNote({
        ok: true,
        text: enabled ? 'Saved and connecting.' : 'Saved.',
      });
    } catch (err) {
      onNote({ ok: false, text: noteText(err) });
    }
  }

  return (
    <form className="config-form" onSubmit={(event) => void submit(event)}>
      <strong>
        {label}
        {initial.isSimulator ? ' (simulator)' : ''}
      </strong>
      <div className="config-fields">
        <label>
          Label
          <input
            aria-label={`${noteKey} label`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label>
          Host
          <input
            aria-label={`${noteKey} host`}
            value={host}
            onChange={(event) => setHost(event.target.value)}
          />
        </label>
        <label>
          Port
          <input
            aria-label={`${noteKey} port`}
            value={port}
            onChange={(event) => setPort(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label>
          Unit id
          <input
            aria-label={`${noteKey} unit`}
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label>
          Protocol
          <select
            aria-label={`${noteKey} protocol`}
            value={protocol}
            onChange={(event) =>
              setProtocol(event.target.value === 'opcua' ? 'opcua' : 'modbus-tcp')
            }
          >
            <option value="modbus-tcp">Modbus TCP</option>
            <option value="opcua">OPC UA</option>
          </select>
        </label>
      </div>
      <label className="config-check">
        <input
          type="checkbox"
          aria-label={`${noteKey} use`}
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Use this PLC
      </label>
      <button type="submit">{submitLabel}</button>
      {note ? (
        <p className={note.ok ? 'status-line' : 'error'}>{note.text}</p>
      ) : null}
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({
        address: Number(value),
        trended: trend,
        ...(showNode ? { nodeId: node } : {}),
      });
      onNote({ ok: true, text: `Saved ${name}.` });
    } catch (err) {
      onNote({ ok: false, text: noteText(err) });
    }
  }

  return (
    <form className="config-form" onSubmit={(event) => void submit(event)}>
      <strong>
        {name} · {kind}
      </strong>
      <label>
        Address
        <input
          aria-label={`${name} address`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="numeric"
        />
      </label>
      {showNode ? (
        <label>
          Node id
          <input
            aria-label={`${name} node`}
            value={node}
            onChange={(event) => setNode(event.target.value)}
          />
        </label>
      ) : null}
      <label className="config-check">
        <input
          type="checkbox"
          aria-label={`${name} trend`}
          checked={trend}
          onChange={(event) => setTrend(event.target.checked)}
        />
        {t('trended')}
      </label>
      <button type="submit">Save {name}</button>
      {note ? (
        <p className={note.ok ? 'status-line' : 'error'}>{note.text}</p>
      ) : null}
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
    <label>
      {allowEmpty ? `${label} (optional)` : label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowEmpty ? <option value="">—</option> : null}
        {registers.map((register) => (
          <option key={register.id} value={register.id}>
            {register.name}
          </option>
        ))}
      </select>
    </label>
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
      onNote({ ok: true, text: `Saved ${label || 'cell'}.` });
    } catch (err) {
      onNote({ ok: false, text: noteText(err) });
    }
  }

  return (
    <form className="config-form" onSubmit={(event) => void submit(event)}>
      <div className="config-fields">
        <label>
          Row
          <input
            aria-label={`${noteKey} row`}
            value={row}
            onChange={(event) => setRow(event.target.value)}
          />
        </label>
        <label>
          Column
          <input
            aria-label={`${noteKey} col`}
            value={col}
            onChange={(event) => setCol(event.target.value)}
          />
        </label>
        <label>
          Label
          <input
            aria-label={`${noteKey} cell-label`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label>
          Style
          <input
            aria-label={`${noteKey} style`}
            value={style}
            onChange={(event) => setStyle(event.target.value)}
          />
        </label>
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
      <label className="config-check">
        <input
          type="checkbox"
          aria-label={`${noteKey} motion`}
          checked={isMotion}
          onChange={(event) => setIsMotion(event.target.checked)}
        />
        Motion
      </label>
      <label className="config-check">
        <input
          type="checkbox"
          aria-label={`${noteKey} safe`}
          checked={requiresSafeAction}
          onChange={(event) => setRequiresSafeAction(event.target.checked)}
        />
        Safe action
      </label>
      <button type="submit">{submitLabel}</button>
      {onDelete ? (
        <button
          type="button"
          className="ghost"
          onClick={() =>
            void onDelete().catch((err: unknown) =>
              onNote({ ok: false, text: noteText(err) }),
            )
          }
        >
          Delete {label || 'cell'}
        </button>
      ) : null}
      {note ? (
        <p className={note.ok ? 'status-line' : 'error'}>{note.text}</p>
      ) : null}
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
      onNote({ ok: true, text: `Saved ${label || 'label'}.` });
    } catch (err) {
      onNote({ ok: false, text: noteText(err) });
    }
  }

  return (
    <form className="config-form" onSubmit={(event) => void submit(event)}>
      <div className="config-fields">
        <label>
          Label
          <input
            aria-label={`${noteKey} overlay-label`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label>
          X
          <input
            aria-label={`${noteKey} x`}
            value={xPct}
            onChange={(event) => setXPct(event.target.value)}
          />
        </label>
        <label>
          Y
          <input
            aria-label={`${noteKey} y`}
            value={yPct}
            onChange={(event) => setYPct(event.target.value)}
          />
        </label>
        <label>
          Format
          <input
            aria-label={`${noteKey} format`}
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          />
        </label>
      </div>
      <RegisterSelect
        label={`${noteKey} overlay-register`}
        value={registerId}
        registers={registers}
        allowEmpty
        onChange={setRegisterId}
      />
      <button type="submit">{submitLabel}</button>
      {onDelete ? (
        <button
          type="button"
          className="ghost"
          onClick={() =>
            void onDelete().catch((err: unknown) =>
              onNote({ ok: false, text: noteText(err) }),
            )
          }
        >
          Delete {label || 'label'}
        </button>
      ) : null}
      {note ? (
        <p className={note.ok ? 'status-line' : 'error'}>{note.text}</p>
      ) : null}
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
      onNote({ ok: true, text: 'Saved background.' });
    } catch (err) {
      onNote({ ok: false, text: noteText(err) });
    }
  }

  return (
    <form className="config-form" onSubmit={(event) => void submit(event)}>
      <label>
        Name
        <input
          aria-label="background name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        CSS background
        <input
          aria-label="background css"
          value={cssBackground}
          onChange={(event) => setCssBackground(event.target.value)}
        />
      </label>
      <label>
        Image URL
        <input
          aria-label="background image"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
          placeholder="https://images.example.com/bay.jpg"
        />
      </label>
      <p className="hint">
        Paste the image file address. A photo page such as unsplash.com/photos
        will not draw. Right-click the picture and copy the image address.
      </p>
      {imageUrl.trim() ? (
        <img
          className="bg-preview"
          alt="Background preview"
          src={imageUrl.trim()}
          onError={() => setImageBroken(true)}
        />
      ) : null}
      {imageBroken ? (
        <p className="error">
          This link did not load as a picture. Copy the image address, not the
          photo page.
        </p>
      ) : null}
      <button type="submit">Save background</button>
      {note ? (
        <p className={note.ok ? 'status-line' : 'error'}>{note.text}</p>
      ) : null}
    </form>
  );
}
