import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
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
import { HelpTip } from '../tour';
import { Field } from '../ui';

function noteOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Save failed';
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

  function remember(key: string, text: string) {
    setNotes((current) => ({ ...current, [key]: text }));
  }

  async function refreshLayout() {
    await queryClient.invalidateQueries({ queryKey: ['layout', token] });
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 pb-12">
      <Text className="mt-1 text-xs text-muted-foreground">
        These fields are saved in SQLite. Turn on Use this PLC and press Save to
        connect. Each register address is the Modbus number the buttons use.
      </Text>
      <HelpTip id="tour.config.plc">
        <Text className="mt-4 text-lg font-bold text-foreground">{t('plcConnections')}</Text>
      </HelpTip>
      {(connections.data ?? []).map((row) => (
        <PlcForm
          key={row.id}
          row={row}
          note={notes[row.id]}
          onSave={async (value) => {
            try {
              await apiPatch(`/plc/connections/${row.id}`, value, token);
              await queryClient.invalidateQueries({ queryKey: ['plc', token] });
              remember(
                row.id,
                value.enabled ? 'Saved and connecting.' : 'Saved.',
              );
            } catch (err) {
              remember(row.id, noteOf(err));
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
            await queryClient.invalidateQueries({ queryKey: ['plc', token] });
            remember('new', value.enabled ? 'Saved and connecting.' : 'Saved.');
          } catch (err) {
            remember('new', noteOf(err));
          }
        }}
      />
      <HelpTip id="tour.config.registers">
        <Text className="mt-4 text-lg font-bold text-foreground">{t('registerMaps')}</Text>
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
              remember(row.id, noteOf(err));
            }
          }}
        />
      ))}
      <HelpTip id="tour.config.cells">
        <Text className="mt-4 text-lg font-bold text-foreground">{t('cellsTitle')}</Text>
      </HelpTip>
      {(layout?.cells ?? []).map((cell) => (
        <CellForm
          key={cell.id}
          cell={cell}
          note={notes[cell.id]}
          saveLabel={`Save ${cell.label}`}
          onSave={async (value) => {
            try {
              await apiPatch(`/hmi/cells/${cell.id}`, value, token);
              await refreshLayout();
              remember(cell.id, `Saved ${value.label || 'cell'}.`);
            } catch (err) {
              remember(cell.id, noteOf(err));
            }
          }}
          onDelete={async () => {
            try {
              await apiDelete(`/hmi/cells/${cell.id}`, token);
              await refreshLayout();
              remember(cell.id, 'Deleted.');
            } catch (err) {
              remember(cell.id, noteOf(err));
            }
          }}
        />
      ))}
      <Text className="mb-1 mt-2 text-muted-foreground">Add a cell</Text>
      <CellForm
        note={notes['new-cell']}
        saveLabel="Add cell"
        primaryDefault={registers[0]?.id ?? ''}
        onSave={async (value) => {
          try {
            await apiPost('/hmi/cells', value, token);
            await refreshLayout();
            remember('new-cell', `Saved ${value.label || 'cell'}.`);
          } catch (err) {
            remember('new-cell', noteOf(err));
          }
        }}
      />
      <HelpTip id="tour.config.labels">
        <Text className="mt-4 text-lg font-bold text-foreground">{t('liveLabels')}</Text>
      </HelpTip>
      {(layout?.overlays ?? []).map((overlay) => (
        <OverlayForm
          key={overlay.id}
          overlay={overlay}
          note={notes[overlay.id]}
          saveLabel={`Save ${overlay.label}`}
          onSave={async (value) => {
            try {
              await apiPatch(`/hmi/overlays/${overlay.id}`, value, token);
              await refreshLayout();
              remember(overlay.id, `Saved ${value.label || 'label'}.`);
            } catch (err) {
              remember(overlay.id, noteOf(err));
            }
          }}
          onDelete={async () => {
            try {
              await apiDelete(`/hmi/overlays/${overlay.id}`, token);
              await refreshLayout();
              remember(overlay.id, 'Deleted.');
            } catch (err) {
              remember(overlay.id, noteOf(err));
            }
          }}
        />
      ))}
      <Text className="mb-1 mt-2 text-muted-foreground">Add a label</Text>
      <OverlayForm
        note={notes['new-label']}
        saveLabel="Add label"
        onSave={async (value) => {
          try {
            await apiPost('/hmi/overlays', value, token);
            await refreshLayout();
            remember('new-label', `Saved ${value.label || 'label'}.`);
          } catch (err) {
            remember('new-label', noteOf(err));
          }
        }}
      />
      <HelpTip id="tour.config.background">
        <Text className="mt-4 text-lg font-bold text-foreground">{t('background')}</Text>
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
              remember('background', noteOf(err));
            }
          }}
        />
      ) : (
        <Text className="mt-1 text-xs text-muted-foreground">No active background</Text>
      )}
      <AlarmBlock token={token} registers={registers} />
      <SafetyBlock token={token} registers={registers} />
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
  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [protocol, setProtocol] = useState<'modbus-tcp' | 'opcua'>(
    row?.protocol ?? 'modbus-tcp',
  );
  return (
    <>
      <Field label="Label" value={label} onChangeText={setLabel} />
      <Field label="Host" value={host} onChangeText={setHost} />
      <Field label="Port" value={port} onChangeText={setPort} />
      <Field label="Unit" value={unitId} onChangeText={setUnitId} />
      <Pressable onPress={() => setEnabled((on) => !on)}>
        <Text className="text-primary">Use this PLC: {enabled ? 'yes' : 'no'}</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          setProtocol((current) =>
            current === 'opcua' ? 'modbus-tcp' : 'opcua',
          )
        }
      >
        <Text className="text-primary">Protocol: {protocol}</Text>
      </Pressable>
      <Pressable
        className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80"
        onPress={() =>
          void onSave({
            label,
            host,
            port: Number(port),
            unitId: Number(unitId),
            enabled,
            protocol,
          })
        }
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
      <Pressable onPress={() => setTrended((on) => !on)}>
        <Text className="text-primary">Trend: {trended ? 'yes' : 'no'}</Text>
      </Pressable>
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
        <Text className="font-bold text-primary-foreground">Save {row.name}</Text>
      </Pressable>
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </>
  );
}

function CellForm({
  cell,
  note,
  saveLabel,
  primaryDefault = '',
  onSave,
  onDelete,
}: {
  cell?: Cell;
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
  return (
    <>
      <Field label="Row" value={row} onChangeText={setRow} />
      <Field label="Col" value={col} onChangeText={setCol} />
      <Field label="Cell label" value={label} onChangeText={setLabel} />
      <Field label="Style" value={style} onChangeText={setStyle} />
      <Field
        label="Primary register id"
        value={primaryRegisterId}
        onChangeText={setPrimary}
      />
      <Field
        label="Feedback register id"
        value={feedbackRegisterId}
        onChangeText={setFeedback}
      />
      <Field
        label="Status register id"
        value={statusRegisterId}
        onChangeText={setStatus}
      />
      <Pressable onPress={() => setIsMotion((on) => !on)}>
        <Text className="text-primary">Motion: {isMotion ? 'yes' : 'no'}</Text>
      </Pressable>
      <Pressable onPress={() => setRequiresSafeAction((on) => !on)}>
        <Text className="text-primary">
          Safe action: {requiresSafeAction ? 'yes' : 'no'}
        </Text>
      </Pressable>
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
        <Pressable className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80" onPress={() => void onDelete()}>
          <Text className="font-bold text-primary-foreground">Delete {label || 'cell'}</Text>
        </Pressable>
      ) : null}
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </>
  );
}

function OverlayForm({
  overlay,
  note,
  saveLabel,
  onSave,
  onDelete,
}: {
  overlay?: Overlay;
  note?: string;
  saveLabel: string;
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
  return (
    <>
      <Field label="Label" value={label} onChangeText={setLabel} />
      <Field label="X percent" value={xPct} onChangeText={setX} />
      <Field label="Y percent" value={yPct} onChangeText={setY} />
      <Field label="Format" value={format} onChangeText={setFormat} />
      <Field
        label="Register id"
        value={registerId}
        onChangeText={setRegisterId}
      />
      <Pressable
        className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80"
        onPress={() =>
          void onSave({
            label,
            xPct: Number(xPct),
            yPct: Number(yPct),
            format,
            registerId,
          })
        }
      >
        <Text className="font-bold text-primary-foreground">{saveLabel}</Text>
      </Pressable>
      {onDelete ? (
        <Pressable className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80" onPress={() => void onDelete()}>
          <Text className="font-bold text-primary-foreground">Delete {label || 'label'}</Text>
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
        <Text className="font-bold text-primary-foreground">Save background</Text>
      </Pressable>
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </>
  );
}

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
      const rows = await apiGet<
        Array<{
          id: string;
          name: string;
          compareOp: string;
          threshold: number;
        }>
      >('/alarms/definitions', token);
      return Array.isArray(rows) ? rows : [];
    },
  });
  const [name, setName] = useState('');
  const [registerId, setRegisterId] = useState(registers[0]?.id ?? '');
  const [threshold, setThreshold] = useState('1');
  const [note, setNote] = useState('');
  return (
    <>
      <HelpTip id="tour.config.alarms">
        <Text className="mt-4 text-lg font-bold text-foreground">{t('alarmDefinitions')}</Text>
      </HelpTip>
      {(defs.data ?? []).length === 0 ? (
        <Text className="mt-1 text-xs text-muted-foreground">{t('noAlarmDefs')}</Text>
      ) : null}
      {(defs.data ?? []).map((row) => (
        <Pressable
          key={row.id}
          onPress={() =>
            void apiDelete(`/alarms/definitions/${row.id}`, token).then(() =>
              queryClient.invalidateQueries({
                queryKey: ['alarm-definitions', token],
              }),
            )
          }
        >
          <Text className="text-primary">
            Delete {row.name} ({row.compareOp} {row.threshold})
          </Text>
        </Pressable>
      ))}
      <Field label="Alarm name" value={name} onChangeText={setName} />
      <Field
        label="Register id"
        value={registerId}
        onChangeText={setRegisterId}
      />
      <Field label="Threshold" value={threshold} onChangeText={setThreshold} />
      <Pressable
        className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80"
        onPress={() =>
          void apiPost(
            '/alarms/definitions',
            {
              name,
              registerId,
              compareOp: 'gt',
              threshold: Number(threshold),
              severity: 'warning',
              enabled: true,
            },
            token,
          )
            .then(() => {
              setNote('Saved alarm.');
              return queryClient.invalidateQueries({
                queryKey: ['alarm-definitions', token],
              });
            })
            .catch((err: unknown) => setNote(noteOf(err)))
        }
      >
        <Text className="font-bold text-primary-foreground">Save alarm</Text>
      </Pressable>
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
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
      }>('/safety/roles', token),
  });
  const [eStop, setEStop] = useState('');
  const [deadman, setDeadman] = useState('');
  const [heartbeat, setHeartbeat] = useState('');
  const [safeState, setSafe] = useState('');
  const [note, setNote] = useState('');
  const current = roles.data;
  return (
    <>
      <HelpTip id="tour.config.safety">
        <Text className="mt-4 text-lg font-bold text-foreground">{t('safetyRoles')}</Text>
      </HelpTip>
      <Text className="mt-1 text-xs text-muted-foreground">
        Saved e-stop {current?.eStopRegisterId ?? 'unset'}
      </Text>
      <Field
        label="E-stop register"
        value={eStop || current?.eStopRegisterId || ''}
        onChangeText={setEStop}
      />
      <Field
        label="Deadman register"
        value={deadman || current?.deadmanRegisterId || ''}
        onChangeText={setDeadman}
      />
      <Field
        label="Heartbeat register"
        value={heartbeat || current?.heartbeatRegisterId || ''}
        onChangeText={setHeartbeat}
      />
      <Field
        label="Safe-state register"
        value={safeState || current?.safeStateRegisterId || ''}
        onChangeText={setSafe}
      />
      <Text className="mt-1 text-xs text-muted-foreground">{registers.length} registers available</Text>
      <Pressable
        className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80"
        onPress={() =>
          void apiPut(
            '/safety/roles',
            {
              eStopRegisterId: eStop || current?.eStopRegisterId || '',
              deadmanRegisterId: deadman || current?.deadmanRegisterId || '',
              heartbeatRegisterId:
                heartbeat || current?.heartbeatRegisterId || '',
              safeStateRegisterId:
                safeState || current?.safeStateRegisterId || '',
            },
            token,
          )
            .then(() => setNote('Saved safety roles.'))
            .catch((err: unknown) => setNote(noteOf(err)))
        }
      >
        <Text className="font-bold text-primary-foreground">Save safety roles</Text>
      </Pressable>
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </>
  );
}
