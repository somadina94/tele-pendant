import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost, HmiLayout } from '../lib/api';

interface PlcConnectionRow {
  id: string;
  label: string;
  host: string;
  port: number;
  unitId?: number;
  enabled: boolean;
  isSimulator: boolean;
}

interface ConnectionInput {
  label: string;
  host: string;
  port: number;
  unitId: number;
  enabled: boolean;
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
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const layoutQuery = useQuery({
    queryKey: ['hmi-layout'],
    queryFn: () => apiGet<HmiLayout>('/hmi/layout'),
  });
  const connections = useQuery({
    queryKey: ['plc-connections'],
    queryFn: () => apiGet<PlcConnectionRow[]>('/plc/connections'),
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

  async function saveRegister(id: string, address: number) {
    await apiPatch(`/hmi/registers/${id}`, { address });
    await queryClient.invalidateQueries({ queryKey: ['hmi-layout'] });
  }

  async function refreshLayout() {
    await queryClient.invalidateQueries({ queryKey: ['hmi-layout'] });
  }

  const layout = layoutQuery.data;
  const registers = layout?.registers ?? [];

  return (
    <main className="shell admin">
      <header className="op-header">
        <h1>HMI config</h1>
        <Link to="/operator">Operator</Link>
      </header>
      <p className="lede">
        These fields are saved in SQLite. Check <strong>Use this PLC</strong>{' '}
        and press <strong>Save</strong> to connect. Each register address is the
        Modbus number the buttons and safety checks use.
      </p>

      <section>
        <h2>PLC connections</h2>
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
            isSimulator: false,
          }}
          submitLabel="Add PLC"
          note={notes.new}
          onNote={(note) => remember('new', note)}
          onSubmit={(value) => saveConnection(null, value)}
        />
      </section>

      <section>
        <h2>Register maps</h2>
        {registers.map((row) => (
          <RegisterEditor
            key={row.id}
            name={row.name}
            kind={row.kind}
            address={row.address}
            note={notes[row.id]}
            onNote={(note) => remember(row.id, note)}
            onSubmit={(address) => saveRegister(row.id, address)}
          />
        ))}
      </section>

      <section>
        <h2>Cells (3 PLC addresses each)</h2>
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
    </main>
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
  note,
  onNote,
  onSubmit,
}: {
  name: string;
  kind: string;
  address: number;
  note?: Note;
  onNote: (note: Note) => void;
  onSubmit: (address: number) => Promise<void>;
}) {
  const [value, setValue] = useState(String(address));

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit(Number(value));
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
        />
      </label>
      <button type="submit">Save background</button>
      {note ? (
        <p className={note.ok ? 'status-line' : 'error'}>{note.text}</p>
      ) : null}
    </form>
  );
}
