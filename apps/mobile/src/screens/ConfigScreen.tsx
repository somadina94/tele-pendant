import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../api';
import type {
  Cell,
  Layout,
  Overlay,
  PlcConnection,
  RegisterRef,
} from '../types';
import { useLocale } from '../locale';
import {
  MOBILE_CONFIG_SECTIONS,
  type MobileConfigSection,
} from '../config-sections';
import { HelpTip } from '../tour';
import {
  alarmSeveritySelectOptions,
  normalizeAlarmSeverity,
  type AlarmSeverity,
} from '@tele-pendant/shared';
import {
  confirmAction,
  confirmDestructive,
  Field,
  SelectField,
  showErrorFrom,
} from '../ui';

function registerOptions(registers: RegisterRef[]) {
  return registers.map((row) => ({ value: row.id, label: row.name }));
}

function registerName(registers: RegisterRef[], id?: string | null): string {
  if (!id) return '—';
  return registers.find((row) => row.id === id)?.name ?? id;
}

const ROUTE_OPTIONS = [
  { value: '/operator', label: 'Operator' },
  { value: '/ops', label: 'Ops' },
  { value: '/media', label: 'Media' },
  { value: '/assistant', label: 'Assistant' },
  { value: '/face', label: 'Face' },
] as const;

const NONE_REGISTER = '__none__';

function isProtectedStopCell(style: string, label: string): boolean {
  return style === 'estop' || label.trim().toUpperCase() === 'STOP';
}

export function ConfigScreen({ token }: { token: string }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const layoutQuery = useQuery({
    queryKey: ['layout', token],
    queryFn: () => apiGet<Layout>('/hmi/layout', token),
  });
  const connections = useQuery({
    queryKey: ['plc', token],
    queryFn: () => apiGet<PlcConnection[]>('/plc/connections', token),
  });
  const layout = layoutQuery.data;
  const registers = layout?.registers ?? [];
  const [section, setSection] = useState<MobileConfigSection>('plc');

  function remember(key: string, text: string) {
    setNotes((current) => ({ ...current, [key]: text }));
  }

  async function refreshLayout() {
    await queryClient.invalidateQueries({ queryKey: ['layout', token] });
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-4 pb-12"
    >
      <Text className="text-lg font-bold text-foreground">{t('config')}</Text>
      <SelectField
        label="Section"
        value={section}
        options={MOBILE_CONFIG_SECTIONS}
        onChange={setSection}
      />
      {layoutQuery.isLoading ? (
        <Text className="text-sm text-muted-foreground">Loading layout…</Text>
      ) : null}
      {section === 'plc' ? (
        <>
          <Text className="mt-1 text-xs text-muted-foreground">
            Turn on Use this PLC and press Save to connect.
          </Text>
          <HelpTip id="tour.config.plc">
            <Text className="mt-4 text-lg font-bold text-foreground">
              {t('plcConnections')}
            </Text>
          </HelpTip>
          {(connections.data ?? []).map((row) => (
            <PlcForm
              key={row.id}
              row={row}
              note={notes[row.id]}
              onSave={async (value) => {
                try {
                  await apiPatch(`/plc/connections/${row.id}`, value, token);
                  await queryClient.invalidateQueries({
                    queryKey: ['plc', token],
                  });
                  remember(
                    row.id,
                    value.enabled ? 'Saved and connecting.' : 'Saved.',
                  );
                } catch (err) {
                  showErrorFrom(err, 'Save failed');
                }
              }}
            />
          ))}
          <Text className="mb-1 mt-2 text-muted-foreground">Add a PLC</Text>
          <PlcForm
            note={notes.new}
            onSave={async (value) => {
              try {
                await apiPost('/plc/connections', value, token);
                await queryClient.invalidateQueries({
                  queryKey: ['plc', token],
                });
                remember(
                  'new',
                  value.enabled ? 'Saved and connecting.' : 'Saved.',
                );
              } catch (err) {
                showErrorFrom(err, 'Save failed');
              }
            }}
          />
        </>
      ) : null}
      {section === 'registers' ? (
        <>
          <HelpTip id="tour.config.registers">
            <Text className="mt-4 text-lg font-bold text-foreground">
              {t('registerMaps')}
            </Text>
          </HelpTip>
          {registers.map((row) => (
            <RegisterForm
              key={row.id}
              row={row}
              note={notes[row.id]}
              onSave={async (value) => {
                try {
                  await apiPatch(`/hmi/registers/${row.id}`, value, token);
                  await refreshLayout();
                  remember(row.id, `Saved ${row.name}.`);
                } catch (err) {
                  showErrorFrom(err, 'Save failed');
                }
              }}
            />
          ))}
        </>
      ) : null}
      {section === 'cells' ? (
        <>
          <HelpTip id="tour.config.cells">
            <Text className="mt-4 text-lg font-bold text-foreground">
              {t('cellsTitle')}
            </Text>
          </HelpTip>
          {(layout?.cells ?? []).map((cell) => (
            <CellForm
              key={cell.id}
              cell={cell}
              registers={registers}
              note={notes[cell.id]}
              saveLabel={`Save ${cell.label}`}
              onSave={async (value) => {
                try {
                  await apiPatch(`/hmi/cells/${cell.id}`, value, token);
                  await refreshLayout();
                  remember(cell.id, `Saved ${value.label || 'cell'}.`);
                } catch (err) {
                  showErrorFrom(err, 'Save failed');
                }
              }}
              onDelete={
                isProtectedStopCell(cell.style, cell.label)
                  ? undefined
                  : async () => {
                      const ok = await confirmDestructive(
                        `Delete ${cell.label}?`,
                        'This action cannot be undone.',
                      );
                      if (!ok) return;
                      try {
                        await apiDelete(`/hmi/cells/${cell.id}`, token);
                        await refreshLayout();
                        remember(cell.id, 'Deleted.');
                      } catch (err) {
                        showErrorFrom(err, 'Delete failed');
                      }
                    }
              }
            />
          ))}
          <Text className="mb-1 mt-2 text-muted-foreground">Add a cell</Text>
          <CellForm
            registers={registers}
            note={notes['new-cell']}
            saveLabel="Add cell"
            primaryDefault={registers[0]?.id ?? ''}
            onSave={async (value) => {
              try {
                await apiPost('/hmi/cells', value, token);
                await refreshLayout();
                remember('new-cell', `Saved ${value.label || 'cell'}.`);
              } catch (err) {
                showErrorFrom(err, 'Save failed');
              }
            }}
          />
        </>
      ) : null}
      {section === 'labels' ? (
        <>
          <HelpTip id="tour.config.labels">
            <Text className="mt-4 text-lg font-bold text-foreground">
              {t('liveLabels')}
            </Text>
          </HelpTip>
          {(layout?.overlays ?? []).map((overlay) => (
            <OverlayForm
              key={overlay.id}
              overlay={overlay}
              registers={registers}
              note={notes[overlay.id]}
              saveLabel={`Save ${overlay.label}`}
              onSave={async (value) => {
                try {
                  await apiPatch(`/hmi/overlays/${overlay.id}`, value, token);
                  await refreshLayout();
                  remember(overlay.id, `Saved ${value.label || 'label'}.`);
                } catch (err) {
                  showErrorFrom(err, 'Save failed');
                }
              }}
              onDelete={async () => {
                const ok = await confirmDestructive(
                  `Delete ${overlay.label}?`,
                  'This action cannot be undone.',
                );
                if (!ok) return;
                try {
                  await apiDelete(`/hmi/overlays/${overlay.id}`, token);
                  await refreshLayout();
                  remember(overlay.id, 'Deleted.');
                } catch (err) {
                  showErrorFrom(err, 'Delete failed');
                }
              }}
            />
          ))}
          <Text className="mb-1 mt-2 text-muted-foreground">Add a label</Text>
          <OverlayForm
            registers={registers}
            note={notes['new-label']}
            saveLabel="Add label"
            resetAfterSave
            onSave={async (value) => {
              try {
                await apiPost('/hmi/overlays', value, token);
                await refreshLayout();
                remember('new-label', `Saved ${value.label || 'label'}.`);
              } catch (err) {
                showErrorFrom(err, 'Save failed');
              }
            }}
          />
        </>
      ) : null}
      {section === 'background' ? (
        <>
          <HelpTip id="tour.config.background">
            <Text className="mt-4 text-lg font-bold text-foreground">
              {t('background')}
            </Text>
          </HelpTip>
          {layout?.background ? (
            <BackgroundForm
              name={layout.background.name}
              cssBackground={layout.background.cssBackground ?? ''}
              imageUrl={layout.background.imageUrl ?? ''}
              note={notes.background}
              onSave={async (value) => {
                try {
                  await apiPatch('/hmi/background', value, token);
                  await refreshLayout();
                  remember('background', 'Saved background.');
                } catch (err) {
                  showErrorFrom(err, 'Save failed');
                }
              }}
            />
          ) : (
            <Text className="mt-1 text-xs text-muted-foreground">
              No active background
            </Text>
          )}
        </>
      ) : null}
      {section === 'codes' ? <ScanCodesBlock token={token} /> : null}
      {section === 'alarms' ? (
        <AlarmBlock token={token} registers={registers} />
      ) : null}
      {section === 'safety' ? (
        <SafetyBlock token={token} registers={registers} />
      ) : null}
    </ScrollView>
  );
}

function PlcForm({
  row,
  note,
  onSave,
}: {
  row?: PlcConnection;
  note?: string;
  onSave: (value: {
    label: string;
    host: string;
    port: number;
    unitId: number;
    enabled: boolean;
    protocol: 'modbus-tcp' | 'opcua';
  }) => Promise<void>;
}) {
  const [label, setLabel] = useState(row?.label ?? '');
  const [host, setHost] = useState(row?.host ?? '');
  const [port, setPort] = useState(String(row?.port ?? 502));
  const [unitId, setUnitId] = useState(String(row?.unitId ?? 1));
  const [enabled, setEnabled] = useState(row?.enabled ?? false);
  const [protocol, setProtocol] = useState<'modbus-tcp' | 'opcua'>(
    row?.protocol ?? 'modbus-tcp',
  );
  return (
    <>
      <Field label="Label" value={label} onChangeText={setLabel} />
      <Field label="Host" value={host} onChangeText={setHost} />
      <Field label="Port" value={port} onChangeText={setPort} />
      <Field label="Unit" value={unitId} onChangeText={setUnitId} />
      <SelectField
        label="Use this PLC"
        value={enabled ? 'yes' : 'no'}
        options={[
          { value: 'no', label: 'No' },
          { value: 'yes', label: 'Yes' },
        ]}
        onChange={(v) => setEnabled(v === 'yes')}
      />
      <SelectField
        label="Protocol"
        value={protocol}
        options={[
          { value: 'modbus-tcp', label: 'Modbus TCP' },
          { value: 'opcua', label: 'OPC UA' },
        ]}
        onChange={setProtocol}
      />
      <Pressable
        className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80"
        onPress={() => {
          void (async () => {
            if (enabled) {
              const ok = await confirmAction(
                'Use this PLC now?',
                'Any other connection will be turned off.',
                'Use this PLC',
              );
              if (!ok) return;
            }
            await onSave({
              label,
              host,
              port: Number(port),
              unitId: Number(unitId),
              enabled,
              protocol,
            });
          })();
        }}
      >
        <Text className="font-bold text-primary-foreground">
          {row ? `Save ${row.label}` : 'Add PLC'}
        </Text>
      </Pressable>
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </>
  );
}

function RegisterForm({
  row,
  note,
  onSave,
}: {
  row: RegisterRef;
  note?: string;
  onSave: (value: {
    address: number;
    trended: boolean;
    nodeId?: string;
  }) => Promise<void>;
}) {
  const [address, setAddress] = useState(String(row.address));
  const [trended, setTrended] = useState(Boolean(row.trended));
  const [nodeId, setNodeId] = useState(row.nodeId ?? '');
  return (
    <>
      <Text className="mb-1 mt-2 text-muted-foreground">
        {row.name} ({row.kind})
      </Text>
      <Field label="Address" value={address} onChangeText={setAddress} />
      <Field label="OPC UA node id" value={nodeId} onChangeText={setNodeId} />
      <SelectField
        label="Trend on Ops"
        value={trended ? 'yes' : 'no'}
        options={[
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        onChange={(v) => setTrended(v === 'yes')}
      />
      <Pressable
        className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80"
        onPress={() =>
          void onSave({
            address: Number(address),
            trended,
            ...(nodeId ? { nodeId } : {}),
          })
        }
      >
        <Text className="font-bold text-primary-foreground">
          Save {row.name}
        </Text>
      </Pressable>
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </>
  );
}

function CellForm({
  cell,
  registers,
  note,
  saveLabel,
  primaryDefault = '',
  onSave,
  onDelete,
}: {
  cell?: Cell;
  registers: RegisterRef[];
  note?: string;
  saveLabel: string;
  primaryDefault?: string;
  onSave: (value: {
    row: number;
    col: number;
    label: string;
    style: string;
    isMotion: boolean;
    requiresSafeAction: boolean;
    primaryRegisterId: string;
    feedbackRegisterId: string;
    statusRegisterId: string;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [row, setRow] = useState(String(cell?.row ?? 0));
  const [col, setCol] = useState(String(cell?.col ?? 0));
  const [label, setLabel] = useState(cell?.label ?? '');
  const [style, setStyle] = useState(cell?.style ?? 'default');
  const [isMotion, setIsMotion] = useState(cell?.isMotion ?? false);
  const [requiresSafeAction, setRequiresSafeAction] = useState(
    cell?.requiresSafeAction ?? false,
  );
  const [primaryRegisterId, setPrimary] = useState(
    cell?.primaryRegister?.id ?? primaryDefault,
  );
  const [feedbackRegisterId, setFeedback] = useState(
    cell?.feedbackRegister?.id ?? '',
  );
  const [statusRegisterId, setStatus] = useState(
    cell?.statusRegister?.id ?? '',
  );
  const regOpts = registerOptions(registers);
  const optionalRegOpts = [
    { value: NONE_REGISTER, label: '(none)' },
    ...regOpts,
  ];
  const feedbackValue = feedbackRegisterId || NONE_REGISTER;
  const statusValue = statusRegisterId || NONE_REGISTER;
  return (
    <>
      <Field label="Row" value={row} onChangeText={setRow} />
      <Field label="Col" value={col} onChangeText={setCol} />
      <Field label="Cell label" value={label} onChangeText={setLabel} />
      <SelectField
        label="Style"
        value={
          style === 'estop'
            ? 'estop'
            : style === 'secondary'
              ? 'secondary'
              : 'default'
        }
        options={[
          { value: 'default', label: 'default' },
          { value: 'secondary', label: 'secondary' },
          { value: 'estop', label: 'estop (STOP)' },
        ]}
        onChange={setStyle}
      />
      <SelectField
        label="Primary register"
        value={primaryRegisterId || regOpts[0]?.value || ''}
        options={regOpts}
        onChange={setPrimary}
      />
      <SelectField
        label="Feedback register"
        value={feedbackValue}
        options={optionalRegOpts}
        onChange={(id) => setFeedback(id === NONE_REGISTER ? '' : id)}
      />
      <SelectField
        label="Status register"
        value={statusValue}
        options={optionalRegOpts}
        onChange={(id) => setStatus(id === NONE_REGISTER ? '' : id)}
      />
      <SelectField
        label="Motion (deadman)"
        value={isMotion ? 'yes' : 'no'}
        options={[
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        onChange={(v) => setIsMotion(v === 'yes')}
      />
      <SelectField
        label="Requires safe action"
        value={requiresSafeAction ? 'yes' : 'no'}
        options={[
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        onChange={(v) => setRequiresSafeAction(v === 'yes')}
      />
      <Pressable
        className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80"
        onPress={() =>
          void onSave({
            row: Number(row),
            col: Number(col),
            label,
            style,
            isMotion,
            requiresSafeAction,
            primaryRegisterId,
            feedbackRegisterId,
            statusRegisterId,
          })
        }
      >
        <Text className="font-bold text-primary-foreground">{saveLabel}</Text>
      </Pressable>
      {onDelete ? (
        <Pressable
          className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80"
          onPress={() => void onDelete()}
        >
          <Text className="font-bold text-primary-foreground">
            Delete {label || 'cell'}
          </Text>
        </Pressable>
      ) : null}
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </>
  );
}

function OverlayForm({
  overlay,
  registers,
  note,
  saveLabel,
  resetAfterSave,
  onSave,
  onDelete,
}: {
  overlay?: Overlay;
  registers: RegisterRef[];
  note?: string;
  saveLabel: string;
  resetAfterSave?: boolean;
  onSave: (value: {
    label: string;
    xPct: number;
    yPct: number;
    format: string;
    registerId: string;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [label, setLabel] = useState(overlay?.label ?? '');
  const [xPct, setX] = useState(String(overlay?.xPct ?? 10));
  const [yPct, setY] = useState(String(overlay?.yPct ?? 10));
  const [format, setFormat] = useState(overlay?.format ?? '{value}');
  const [registerId, setRegisterId] = useState(overlay?.register?.id ?? '');
  const regOpts = registerOptions(registers);

  function resetAddForm() {
    setLabel('');
    setX('10');
    setY('10');
    setFormat('{value}');
    setRegisterId('');
  }

  return (
    <>
      <Field label="Label" value={label} onChangeText={setLabel} />
      <Field label="X percent" value={xPct} onChangeText={setX} />
      <Field label="Y percent" value={yPct} onChangeText={setY} />
      <Field label="Format" value={format} onChangeText={setFormat} />
      <SelectField
        label="Register"
        value={registerId || regOpts[0]?.value || ''}
        options={regOpts}
        onChange={setRegisterId}
      />
      <Pressable
        className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80"
        onPress={() => {
          void (async () => {
            await onSave({
              label,
              xPct: Number(xPct),
              yPct: Number(yPct),
              format,
              registerId,
            });
            if (resetAfterSave && !overlay) resetAddForm();
          })();
        }}
      >
        <Text className="font-bold text-primary-foreground">{saveLabel}</Text>
      </Pressable>
      {onDelete ? (
        <Pressable
          className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80"
          onPress={() => void onDelete()}
        >
          <Text className="font-bold text-primary-foreground">
            Delete {label || 'label'}
          </Text>
        </Pressable>
      ) : null}
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </>
  );
}

function BackgroundForm({
  name: initialName,
  cssBackground: initialCss,
  imageUrl: initialImage,
  note,
  onSave,
}: {
  name: string;
  cssBackground: string;
  imageUrl: string;
  note?: string;
  onSave: (value: {
    name: string;
    cssBackground: string;
    imageUrl: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [cssBackground, setCss] = useState(initialCss);
  const [imageUrl, setImage] = useState(initialImage);
  return (
    <>
      <Field label="Name" value={name} onChangeText={setName} />
      <Field
        label="CSS background"
        value={cssBackground}
        onChangeText={setCss}
      />
      <Field label="Image URL" value={imageUrl} onChangeText={setImage} />
      <Pressable
        className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80"
        onPress={() => void onSave({ name, cssBackground, imageUrl })}
      >
        <Text className="font-bold text-primary-foreground">
          Save background
        </Text>
      </Pressable>
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </>
  );
}

type AlarmDefinitionRow = {
  id: string;
  name: string;
  severity: string;
  compareOp: string;
  threshold: number;
  enabled: boolean;
  register?: { id: string; name: string } | null;
};

function AlarmBlock({
  token,
  registers,
}: {
  token: string;
  registers: RegisterRef[];
}) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const defs = useQuery({
    queryKey: ['alarm-definitions', token],
    queryFn: async () => {
      const rows = await apiGet<AlarmDefinitionRow[]>(
        '/alarms/definitions',
        token,
      );
      return Array.isArray(rows) ? rows : [];
    },
  });
  const [name, setName] = useState('');
  const [registerId, setRegisterId] = useState('');
  useEffect(() => {
    if (!registerId && registers[0]?.id) {
      setRegisterId(registers[0].id);
    }
  }, [registerId, registers]);
  const [compareOp, setCompareOp] = useState<'eq' | 'gt' | 'lt' | 'neq'>('gt');
  const [threshold, setThreshold] = useState('1');
  const [severity, setSeverity] = useState<AlarmSeverity>('warning');
  const [enabled, setEnabled] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const regOpts = registerOptions(registers);

  function resetForm() {
    setName('');
    setCompareOp('gt');
    setThreshold('1');
    setSeverity('warning');
    setEnabled(true);
    setEditingId(null);
    setRegisterId(registers[0]?.id ?? '');
  }

  async function saveAlarm() {
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
        await apiPatch(`/alarms/definitions/${editingId}`, body, token);
      } else {
        await apiPost('/alarms/definitions', body, token);
      }
      await queryClient.invalidateQueries({
        queryKey: ['alarm-definitions', token],
      });
      setNote('Saved alarm.');
      resetForm();
    } catch (err) {
      showErrorFrom(err, 'Save failed');
    }
  }

  return (
    <>
      <HelpTip id="tour.config.alarms">
        <Text className="mt-4 text-lg font-bold text-foreground">
          {t('alarmDefinitions')}
        </Text>
      </HelpTip>
      {(defs.data ?? []).length === 0 ? (
        <Text className="mt-1 text-xs text-muted-foreground">
          {t('noAlarmDefs')}
        </Text>
      ) : null}
      {(defs.data ?? []).map((row) => (
        <View key={row.id} className="mb-2 rounded-lg border border-border p-2">
          <Text className="text-sm font-medium text-foreground">
            {row.name}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {row.register?.name ?? '—'} · {row.compareOp} {row.threshold} ·{' '}
            {normalizeAlarmSeverity(row.severity)}
            {row.enabled ? '' : ' · disabled'}
          </Text>
          <View className="mt-1 flex-row gap-3">
            <Pressable
              onPress={() => {
                setEditingId(row.id);
                setName(row.name);
                setRegisterId(row.register?.id ?? registers[0]?.id ?? '');
                setCompareOp(row.compareOp as 'eq' | 'gt' | 'lt' | 'neq');
                setThreshold(String(row.threshold));
                setSeverity(normalizeAlarmSeverity(row.severity));
                setEnabled(row.enabled);
              }}
            >
              <Text className="text-primary">Edit {row.name}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void (async () => {
                  const ok = await confirmDestructive(
                    `Delete ${row.name}?`,
                    'This action cannot be undone.',
                  );
                  if (!ok) return;
                  await apiDelete(`/alarms/definitions/${row.id}`, token);
                  await queryClient.invalidateQueries({
                    queryKey: ['alarm-definitions', token],
                  });
                  if (editingId === row.id) resetForm();
                  setNote('Deleted alarm.');
                })();
              }}
            >
              <Text className="text-primary">
                {t('delete')} {row.name}
              </Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Field label="Alarm name" value={name} onChangeText={setName} />
      <SelectField
        label="Register"
        value={registerId || regOpts[0]?.value || ''}
        options={regOpts}
        onChange={setRegisterId}
      />
      <SelectField
        label="Operator"
        value={compareOp}
        options={[
          { value: 'eq', label: 'eq' },
          { value: 'gt', label: 'gt' },
          { value: 'lt', label: 'lt' },
          { value: 'neq', label: 'neq' },
        ]}
        onChange={(value) => setCompareOp(value)}
      />
      <Field label="Threshold" value={threshold} onChangeText={setThreshold} />
      <SelectField
        label="Severity"
        value={severity}
        options={alarmSeveritySelectOptions()}
        onChange={(value) => setSeverity(value as AlarmSeverity)}
      />
      <SelectField
        label="Enabled"
        value={enabled ? 'yes' : 'no'}
        options={[
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        onChange={(v) => setEnabled(v === 'yes')}
      />
      <Pressable
        className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80"
        onPress={() => void saveAlarm()}
      >
        <Text className="font-bold text-primary-foreground">
          {editingId ? `Update ${name || 'alarm'}` : t('saveAlarm')}
        </Text>
      </Pressable>
      {editingId ? (
        <Pressable onPress={resetForm}>
          <Text className="mt-1 text-primary">Cancel edit</Text>
        </Pressable>
      ) : null}
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </>
  );
}

type ScanCodeRow = {
  id: string;
  code: string;
  label: string;
  kind: string;
  routeHint?: string | null;
  notes?: string | null;
};

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
  const [note, setNote] = useState('');

  return (
    <View className="mb-4 rounded-lg border border-border p-3">
      <Field label="QR / barcode payload" value={code} onChangeText={setCode} />
      <Field label="Label" value={label} onChangeText={setLabel} />
      <SelectField
        label="Kind"
        value={kind}
        options={[
          { value: 'asset', label: 'Asset' },
          { value: 'shortcut', label: 'Shortcut' },
          { value: 'other', label: 'Other' },
        ]}
        onChange={setKind}
      />
      <SelectField
        label="Open screen after scan"
        value={routeHint || ''}
        options={[
          { value: '', label: '(none)' },
          ...ROUTE_OPTIONS.map((row) => ({
            value: row.value,
            label: row.label,
          })),
        ]}
        onChange={setRouteHint}
      />
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} />
      <Pressable
        className="mt-2 flex-row items-center justify-center rounded-lg bg-primary px-4 py-3"
        onPress={() => {
          void onSubmit({
            code,
            label,
            kind,
            routeHint: routeHint.trim() || null,
            notes: notes.trim() || null,
          })
            .then(() => setNote('Saved.'))
            .catch((err: unknown) => showErrorFrom(err, 'Save failed'));
        }}
      >
        <Text className="font-bold text-primary-foreground">{submitLabel}</Text>
      </Pressable>
      {onDelete ? (
        <Pressable className="mt-2 py-2" onPress={onDelete}>
          <Text className="text-center text-destructive">Delete</Text>
        </Pressable>
      ) : null}
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </View>
  );
}

function ScanCodesBlock({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const codes = useQuery({
    queryKey: ['scan-codes', token],
    queryFn: () => apiGet<ScanCodeRow[]>('/media/codes', token),
  });
  const reportedLoadError = useRef(false);

  useEffect(() => {
    if (codes.isError && !reportedLoadError.current) {
      reportedLoadError.current = true;
      showErrorFrom(codes.error, 'Could not load scan codes');
    }
    if (!codes.isError) {
      reportedLoadError.current = false;
    }
  }, [codes.error, codes.isError]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['scan-codes', token] });
  }

  return (
    <>
      <HelpTip id="tour.config.codes">
        <Text className="mt-2 text-lg font-bold text-foreground">
          QR / scan codes
        </Text>
      </HelpTip>
      <Text className="mb-2 text-xs text-muted-foreground">
        Register the exact string in each QR. Operators resolve on Media.
      </Text>
      {(codes.data ?? []).map((row) => (
        <ScanCodeEditor
          key={row.id}
          initial={row}
          submitLabel={`Save ${row.code}`}
          onSubmit={(value) =>
            apiPatch(`/media/codes/${row.id}`, value, token).then(refresh)
          }
          onDelete={() => {
            void (async () => {
              const ok = await confirmDestructive(
                `Delete ${row.code}?`,
                'This action cannot be undone.',
              );
              if (!ok) return;
              await apiDelete(`/media/codes/${row.id}`, token);
              await refresh();
            })();
          }}
        />
      ))}
      <Text className="mb-1 font-medium text-foreground">Add code</Text>
      <ScanCodeEditor
        initial={{
          code: '',
          label: '',
          kind: 'asset',
          routeHint: '/operator',
          notes: '',
        }}
        submitLabel="Add code"
        onSubmit={(value) =>
          apiPost('/media/codes', value, token).then(refresh)
        }
      />
    </>
  );
}

function SafetyBlock({
  token,
  registers,
}: {
  token: string;
  registers: RegisterRef[];
}) {
  const { t } = useLocale();
  const roles = useQuery({
    queryKey: ['safety-roles', token],
    queryFn: () =>
      apiGet<{
        eStopRegisterId?: string | null;
        deadmanRegisterId?: string | null;
        heartbeatRegisterId?: string | null;
        safeStateRegisterId?: string | null;
        allowTimedMediaMotion?: boolean;
      }>('/safety/roles', token),
  });
  const [eStop, setEStop] = useState('');
  const [deadman, setDeadman] = useState('');
  const [heartbeat, setHeartbeat] = useState('');
  const [safeState, setSafe] = useState('');
  const [allowTimedDraft, setAllowTimedDraft] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  const [note, setNote] = useState('');
  const current = roles.data;
  const timedOn =
    allowTimedDraft ?? Boolean(current?.allowTimedMediaMotion ?? false);
  return (
    <>
      <HelpTip id="tour.config.safety">
        <Text className="mt-4 text-lg font-bold text-foreground">
          {t('safetyRoles')}
        </Text>
      </HelpTip>
      <Text className="mt-1 text-xs text-muted-foreground">
        Saved e-stop: {registerName(registers, current?.eStopRegisterId)}
      </Text>
      <SelectField
        label="E-stop register"
        value={
          eStop ||
          current?.eStopRegisterId ||
          registerOptions(registers)[0]?.value ||
          ''
        }
        options={registerOptions(registers)}
        onChange={setEStop}
      />
      <SelectField
        label="Deadman register"
        value={
          deadman ||
          current?.deadmanRegisterId ||
          registerOptions(registers)[0]?.value ||
          ''
        }
        options={registerOptions(registers)}
        onChange={setDeadman}
      />
      <SelectField
        label="Heartbeat register"
        value={
          heartbeat ||
          current?.heartbeatRegisterId ||
          registerOptions(registers)[0]?.value ||
          ''
        }
        options={registerOptions(registers)}
        onChange={setHeartbeat}
      />
      <SelectField
        label="Safe-state register"
        value={
          safeState ||
          current?.safeStateRegisterId ||
          registerOptions(registers)[0]?.value ||
          ''
        }
        options={registerOptions(registers)}
        onChange={setSafe}
      />
      <Text className="mt-1 text-xs text-muted-foreground">
        {registers.length} registers available
      </Text>
      <SelectField
        label={t('allowTimedMedia')}
        value={timedOn ? 'yes' : 'no'}
        options={[
          { value: 'no', label: 'Off (default)' },
          { value: 'yes', label: 'On' },
        ]}
        onChange={(v) => setAllowTimedDraft(v === 'yes')}
      />
      <Text className="mt-3 mb-1 text-xs text-muted-foreground">
        {t('safePin')} (required to save)
      </Text>
      <TextInput
        className="mb-2 rounded-lg border border-border bg-card px-3 py-2.5 text-foreground"
        secureTextEntry
        autoCapitalize="none"
        value={pin}
        onChangeText={setPin}
        placeholder={t('safePin')}
      />
      <Pressable
        className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80"
        onPress={() => {
          if (!pin.trim()) {
            showErrorFrom(
              new Error('Reset PIN is required to save safety roles'),
              'Save failed',
            );
            return;
          }
          void apiPut(
            '/safety/roles',
            {
              eStopRegisterId: eStop || current?.eStopRegisterId || '',
              deadmanRegisterId: deadman || current?.deadmanRegisterId || '',
              heartbeatRegisterId:
                heartbeat || current?.heartbeatRegisterId || '',
              safeStateRegisterId:
                safeState || current?.safeStateRegisterId || '',
              allowTimedMediaMotion: timedOn,
              pin: pin.trim(),
            },
            token,
          )
            .then(() => {
              setPin('');
              setNote('Saved safety roles.');
            })
            .catch((err: unknown) => showErrorFrom(err, 'Save failed'));
        }}
      >
        <Text className="font-bold text-primary-foreground">
          Save safety roles
        </Text>
      </Pressable>
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </>
  );
}
