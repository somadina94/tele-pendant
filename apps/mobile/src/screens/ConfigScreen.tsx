import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';
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
  mobileConfigSectionsForRole,
  type MobileConfigSection,
} from '../config-sections';
import { HelpTip } from '../tour';
import { getStoredUserRole } from '../user-session';
import {
  alarmSeveritySelectOptions,
  normalizeAlarmSeverity,
  type AlarmSeverity,
  type UserRole,
} from '@tele-pendant/shared';
import {
  Btn,
  confirmAction,
  confirmDestructive,
  Field,
  SelectField,
  showErrorFrom,
} from '../ui';

type PlcHealth = {
  connected: boolean;
  connectionId: string | null;
  label: string | null;
  host: string | null;
  port: number | null;
  lastError: string | null;
};

function ConfigCheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      className="min-h-[44px] flex-row items-center gap-2 py-1 active:opacity-80"
      onPress={() => onChange(!checked)}
    >
      <View
        className={`h-5 w-5 items-center justify-center rounded border ${
          checked ? 'border-primary bg-primary' : 'border-border bg-card'
        }`}
      >
        {checked ? <Check size={14} color="#041018" strokeWidth={3} /> : null}
      </View>
      <Text className="flex-1 text-sm text-foreground">{label}</Text>
    </Pressable>
  );
}

function PlcConnectionStatus({
  connectionId,
  inUse,
  health,
  healthLoading,
}: {
  connectionId: string;
  inUse: boolean;
  health?: PlcHealth | null;
  healthLoading?: boolean;
}) {
  if (!inUse) return null;
  if (healthLoading || health === undefined) {
    return (
      <Text className="mb-2 text-sm text-muted-foreground">
        Checking connection…
      </Text>
    );
  }
  if (!health) {
    return (
      <Text className="mb-2 text-sm text-muted-foreground">
        Checking connection…
      </Text>
    );
  }
  if (health.connectionId !== connectionId) {
    return (
      <Text className="mb-2 text-sm text-muted-foreground">
        Standby — another PLC is active
      </Text>
    );
  }
  if (health.connected) {
    return (
      <View className="mb-2 self-start rounded-md bg-emerald-600 px-2.5 py-1">
        <Text className="text-xs font-semibold text-white">Connected</Text>
      </View>
    );
  }
  return (
    <Text className="mb-2 text-sm text-destructive">
      Not connected{health.lastError ? `: ${health.lastError}` : ''}
    </Text>
  );
}

const SAFETY_REGISTER_NAMES = new Set([
  'coil.eStop',
  'coil.deadman',
  'holding.heartbeat',
  'holding.safeState',
]);

function isSafetyRegisterName(name: string): boolean {
  return SAFETY_REGISTER_NAMES.has(name);
}

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

type ConfigUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  suspended?: boolean;
};

export function ConfigScreen({ token }: { token: string }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const layoutQuery = useQuery({
    queryKey: ['layout', token],
    queryFn: () => apiGet<Layout>('/hmi/layout', token),
  });
  const connections = useQuery({
    queryKey: ['plc', token],
    queryFn: () => apiGet<PlcConnection[]>('/plc/connections', token),
  });
  const plcHealth = useQuery({
    queryKey: ['plc-health', token],
    queryFn: () => apiGet<PlcHealth>('/plc/health', token),
    refetchInterval: 4000,
  });
  const layout = layoutQuery.data;
  const registers = layout?.registers ?? [];
  const sectionOptions = useMemo(
    () => mobileConfigSectionsForRole(userRole),
    [userRole],
  );
  const [section, setSection] = useState<MobileConfigSection>('plc');

  useEffect(() => {
    void getStoredUserRole().then((role) => {
      setUserRole(role);
    });
  }, [token]);

  useEffect(() => {
    if (!sectionOptions.some((s) => s.value === section)) {
      setSection(sectionOptions[0]?.value ?? 'plc');
    }
  }, [sectionOptions, section]);

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
        options={sectionOptions}
        onChange={(value) => setSection(value as MobileConfigSection)}
      />
      {layoutQuery.isLoading ? (
        <Text className="text-sm text-muted-foreground">Loading layout…</Text>
      ) : null}
      {section === 'users' ? (
        <UsersBlock token={token} notes={notes} remember={remember} />
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
              health={plcHealth.data}
              healthLoading={plcHealth.isLoading}
              onSave={async (value) => {
                try {
                  await apiPatch(`/plc/connections/${row.id}`, value, token);
                  await queryClient.invalidateQueries({
                    queryKey: ['plc', token],
                  });
                  await queryClient.invalidateQueries({
                    queryKey: ['plc-health', token],
                  });
                  remember(row.id, 'Saved.');
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
                await queryClient.invalidateQueries({
                  queryKey: ['plc-health', token],
                });
                remember('new', 'Saved.');
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
              safetyCritical={isSafetyRegisterName(row.name)}
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
          <Text className="mt-1 text-xs text-muted-foreground">
            Upload graphics on web Config. Here: switch screens and edit the
            active name / CSS / image URL. Empty image URL keeps the crane
            mimic.
          </Text>
          <BackgroundScreens
            screens={layout?.backgrounds ?? []}
            note={notes['background-screens']}
            onActivate={async (id) => {
              try {
                await apiPost(`/hmi/backgrounds/${id}/activate`, {}, token);
                await refreshLayout();
                remember('background-screens', 'Active screen updated.');
              } catch (err) {
                showErrorFrom(err, 'Activate failed');
              }
            }}
            onCreate={async (name) => {
              try {
                await apiPost('/hmi/backgrounds', { name }, token);
                await refreshLayout();
                remember('background-screens', 'Screen created.');
              } catch (err) {
                showErrorFrom(err, 'Create failed');
              }
            }}
          />
          {layout?.background ? (
            <BackgroundForm
              key={layout.background.id}
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

function isManagedUser(row: ConfigUser) {
  return row.role !== 'admin';
}

function UsersBlock({
  token,
  notes,
  remember,
}: {
  token: string;
  notes: Record<string, string>;
  remember: (key: string, text: string) => void;
}) {
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ['users', token],
    queryFn: () => apiGet<ConfigUser[]>('/users', token),
  });
  const reportedLoadError = useRef(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'operator' | 'supervisor'>('operator');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (users.isError && !reportedLoadError.current) {
      reportedLoadError.current = true;
      showErrorFrom(users.error, 'Could not load users');
    }
    if (!users.isError) {
      reportedLoadError.current = false;
    }
  }, [users.error, users.isError]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['users', token] });
  }

  return (
    <>
      <HelpTip id="tour.config.users">
        <Text className="mt-2 text-lg font-bold text-foreground">Users</Text>
      </HelpTip>
      <Text className="mb-2 text-xs text-muted-foreground">
        Create operator/supervisor accounts. Admins cannot be edited here.
      </Text>
      {users.isLoading ? (
        <Text className="text-sm text-muted-foreground">Loading users…</Text>
      ) : null}
      {(users.data ?? []).length === 0 && users.isSuccess ? (
        <Text className="mb-2 text-sm text-muted-foreground">
          No users yet.
        </Text>
      ) : null}
      {(users.data ?? []).map((row) => {
        const managed = isManagedUser(row);
        const editing = editingId === row.id;
        return (
          <View
            key={row.id}
            className="mb-3 rounded-lg border border-border bg-card p-3"
          >
            <Text className="font-medium text-foreground">
              {row.displayName || row.email}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {row.email} · {row.role}
              {row.suspended ? ' · suspended' : ''}
            </Text>
            {notes[row.id] ? (
              <Text className="mt-1 text-xs text-success">{notes[row.id]}</Text>
            ) : null}
            {managed ? (
              <View className="mt-2 flex-row flex-wrap gap-2">
                <Pressable
                  className="rounded-lg border border-border px-3 py-2 active:opacity-80"
                  onPress={() => setEditingId(editing ? null : row.id)}
                >
                  <Text className="text-sm text-foreground">
                    {editing ? 'Close' : 'Edit'}
                  </Text>
                </Pressable>
                <Pressable
                  className="rounded-lg border border-border px-3 py-2 active:opacity-80"
                  onPress={() => {
                    void (async () => {
                      const next = !(row.suspended === true);
                      const ok = await confirmAction(
                        next ? 'Suspend user?' : 'Reactivate user?',
                        next
                          ? `Block sign-in for ${row.displayName || row.email}?`
                          : `Allow ${row.displayName || row.email} to sign in again?`,
                        next ? 'Suspend' : 'Reactivate',
                      );
                      if (!ok) return;
                      try {
                        await apiPatch(
                          `/users/${row.id}`,
                          { suspended: next },
                          token,
                        );
                        await refresh();
                        remember(
                          row.id,
                          next ? 'User suspended.' : 'User reactivated.',
                        );
                      } catch (err) {
                        showErrorFrom(err, 'Could not update user');
                      }
                    })();
                  }}
                >
                  <Text className="text-sm text-foreground">
                    {row.suspended ? 'Reactivate' : 'Suspend'}
                  </Text>
                </Pressable>
                <Pressable
                  className="rounded-lg border border-destructive px-3 py-2 active:opacity-80"
                  onPress={() => {
                    void (async () => {
                      const ok = await confirmDestructive(
                        'Remove user?',
                        `Permanently delete ${row.displayName || row.email}? This cannot be undone.`,
                      );
                      if (!ok) return;
                      try {
                        await apiDelete(`/users/${row.id}`, token);
                        await refresh();
                        remember(row.id, 'User removed.');
                        if (editingId === row.id) setEditingId(null);
                      } catch (err) {
                        showErrorFrom(err, 'Could not remove user');
                      }
                    })();
                  }}
                >
                  <Text className="text-sm text-destructive">Remove</Text>
                </Pressable>
              </View>
            ) : (
              <Text className="mt-1 text-xs text-muted-foreground">
                Admin accounts are managed outside this list.
              </Text>
            )}
            {editing && managed ? (
              <UserEditForm
                row={row}
                note={notes[`edit-${row.id}`]}
                onSave={async (value) => {
                  try {
                    await apiPatch(`/users/${row.id}`, value, token);
                    await refresh();
                    remember(`edit-${row.id}`, 'User updated.');
                    setEditingId(null);
                  } catch (err) {
                    showErrorFrom(err, 'Could not update user');
                  }
                }}
              />
            ) : null}
          </View>
        );
      })}
      <Text className="mb-1 mt-2 font-medium text-foreground">Add user</Text>
      {notes['new-user'] ? (
        <Text className="mb-1 text-xs text-success">{notes['new-user']}</Text>
      ) : null}
      <Field
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secure
      />
      <SelectField
        label="Role"
        value={role}
        options={[
          { value: 'operator', label: 'Operator' },
          { value: 'supervisor', label: 'Supervisor' },
        ]}
        onChange={(v) => setRole(v as 'operator' | 'supervisor')}
      />
      <Btn
        onPress={async () => {
          try {
            await apiPost(
              '/users',
              { email, displayName, password, role },
              token,
            );
            await refresh();
            setEmail('');
            setDisplayName('');
            setPassword('');
            remember('new-user', `Added ${displayName || email}.`);
          } catch (err) {
            showErrorFrom(err, 'Could not add user');
          }
        }}
      >
        <Text className="font-semibold text-primary-foreground">Add user</Text>
      </Btn>
    </>
  );
}

function UserEditForm({
  row,
  note,
  onSave,
}: {
  row: ConfigUser;
  note?: string;
  onSave: (value: {
    displayName: string;
    email: string;
    role: 'operator' | 'supervisor';
    suspended: boolean;
    password?: string;
  }) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(row.displayName ?? '');
  const [email, setEmail] = useState(row.email);
  const [role, setRole] = useState<'operator' | 'supervisor'>(
    row.role === 'supervisor' ? 'supervisor' : 'operator',
  );
  const [suspended, setSuspended] = useState(row.suspended === true);
  const [password, setPassword] = useState('');

  return (
    <View className="mt-3 border-t border-border pt-3">
      <Field
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <SelectField
        label="Role"
        value={role}
        options={[
          { value: 'operator', label: 'Operator' },
          { value: 'supervisor', label: 'Supervisor' },
        ]}
        onChange={(v) => setRole(v as 'operator' | 'supervisor')}
      />
      <SelectField
        label="Suspended"
        value={suspended ? 'yes' : 'no'}
        options={[
          { value: 'no', label: 'No' },
          { value: 'yes', label: 'Yes' },
        ]}
        onChange={(v) => setSuspended(v === 'yes')}
      />
      <Field
        label="New password (optional)"
        value={password}
        onChangeText={setPassword}
        secure
        placeholder="Leave blank to keep current"
      />
      {note ? <Text className="mb-1 text-xs text-success">{note}</Text> : null}
      <Btn
        onPress={() =>
          onSave({
            displayName,
            email,
            role,
            suspended,
            ...(password.trim() ? { password: password.trim() } : {}),
          })
        }
      >
        <Text className="font-semibold text-primary-foreground">
          Save changes
        </Text>
      </Btn>
    </View>
  );
}

function PlcForm({
  row,
  note,
  health,
  healthLoading,
  onSave,
}: {
  row?: PlcConnection;
  note?: string;
  health?: PlcHealth | null;
  healthLoading?: boolean;
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
      <ConfigCheckRow
        label="Use this PLC"
        checked={enabled}
        onChange={setEnabled}
      />
      {row?.id ? (
        <PlcConnectionStatus
          connectionId={row.id}
          inUse={row.enabled}
          health={health}
          healthLoading={healthLoading}
        />
      ) : null}
      <SelectField
        label="Protocol"
        value={protocol}
        options={[
          { value: 'modbus-tcp', label: 'Modbus TCP' },
          { value: 'opcua', label: 'OPC UA' },
        ]}
        onChange={setProtocol}
      />
      <Btn
        onPress={async () => {
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
        }}
      >
        <Text className="font-bold text-primary-foreground">
          {row ? `Save ${row.label}` : 'Add PLC'}
        </Text>
      </Btn>
      {note ? (
        <Text className="my-2 flex-shrink text-success" numberOfLines={3}>
          {note}
        </Text>
      ) : null}
    </>
  );
}

function RegisterForm({
  row,
  safetyCritical,
  note,
  onSave,
}: {
  row: RegisterRef;
  safetyCritical: boolean;
  note?: string;
  onSave: (value: {
    address: number;
    trended: boolean;
    nodeId?: string;
    pin?: string;
  }) => Promise<void>;
}) {
  const { t } = useLocale();
  const [address, setAddress] = useState(String(row.address));
  const [trended, setTrended] = useState(Boolean(row.trended));
  const [nodeId, setNodeId] = useState(row.nodeId ?? '');
  const [pin, setPin] = useState('');
  const addressChanged = Number(address) !== row.address;
  return (
    <>
      <Text className="mb-1 mt-2 text-muted-foreground">
        {row.name} ({row.kind}){safetyCritical ? ' — Safety' : ''}
      </Text>
      {safetyCritical ? (
        <Text className="mb-2 text-xs text-muted-foreground">
          Changing this address retargets e-stop/deadman/heartbeat/safe-state.
          Reset PIN required when the address changes.
        </Text>
      ) : null}
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
      {safetyCritical && addressChanged ? (
        <>
          <Text className="mt-2 mb-1 text-xs text-muted-foreground">
            {t('safePin')}
          </Text>
          <TextInput
            className="mb-2 rounded-lg border border-border bg-card px-3 py-2.5 text-foreground"
            secureTextEntry
            autoCapitalize="none"
            value={pin}
            onChangeText={setPin}
            placeholder={t('safePin')}
          />
        </>
      ) : null}
      <Btn
        onPress={async () => {
          if (safetyCritical && addressChanged && !pin.trim()) {
            showErrorFrom(
              new Error(
                'Reset PIN is required to change a safety register address',
              ),
              'Save failed',
            );
            return;
          }
          await onSave({
            address: Number(address),
            trended,
            ...(nodeId ? { nodeId } : {}),
            ...(safetyCritical && addressChanged ? { pin: pin.trim() } : {}),
          });
          setPin('');
        }}
      >
        <Text className="font-bold text-primary-foreground">
          Save {row.name}
        </Text>
      </Btn>
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
    variableSpeed: boolean;
    slowSpeedPct?: number;
    fastSpeedPct?: number;
    primaryRegisterId: string;
    feedbackRegisterId: string;
    statusRegisterId: string;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const { t } = useLocale();
  const [row, setRow] = useState(String(cell?.row ?? 0));
  const [col, setCol] = useState(String(cell?.col ?? 0));
  const [label, setLabel] = useState(cell?.label ?? '');
  const [style, setStyle] = useState(cell?.style ?? 'default');
  const [isMotion, setIsMotion] = useState(cell?.isMotion ?? false);
  const [requiresSafeAction, setRequiresSafeAction] = useState(
    cell?.requiresSafeAction ?? false,
  );
  const [variableSpeed, setVariableSpeed] = useState(
    cell?.variableSpeed ?? cell?.isMotion ?? false,
  );
  const [slowSpeedPct, setSlowSpeedPct] = useState(
    String(cell?.slowSpeedPct ?? 30),
  );
  const [fastSpeedPct, setFastSpeedPct] = useState(
    String(cell?.fastSpeedPct ?? 100),
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
      <View className="mb-1 mt-1 flex-row flex-wrap gap-x-4 gap-y-1">
        <ConfigCheckRow
          label="Motion"
          checked={isMotion}
          onChange={(next) => {
            setIsMotion(next);
            if (!next) setVariableSpeed(false);
            else if (!variableSpeed) setVariableSpeed(true);
          }}
        />
        <ConfigCheckRow
          label="Safe action"
          checked={requiresSafeAction}
          onChange={setRequiresSafeAction}
        />
        {isMotion ? (
          <ConfigCheckRow
            label={t('variableSpeed')}
            checked={variableSpeed}
            onChange={setVariableSpeed}
          />
        ) : null}
      </View>
      {isMotion && variableSpeed ? (
        <>
          <Field
            label="Slow speed %"
            value={slowSpeedPct}
            onChangeText={setSlowSpeedPct}
            keyboardType="numeric"
          />
          <Field
            label="Fast speed %"
            value={fastSpeedPct}
            onChangeText={setFastSpeedPct}
            keyboardType="numeric"
          />
        </>
      ) : null}
      <Btn
        onPress={() =>
          onSave({
            row: Number(row),
            col: Number(col),
            label,
            style,
            isMotion,
            requiresSafeAction,
            variableSpeed: isMotion ? variableSpeed : false,
            ...(isMotion && variableSpeed
              ? {
                  slowSpeedPct: Number(slowSpeedPct) || 30,
                  fastSpeedPct: Number(fastSpeedPct) || 100,
                }
              : {}),
            primaryRegisterId,
            feedbackRegisterId,
            statusRegisterId,
          })
        }
      >
        <Text className="font-bold text-primary-foreground">{saveLabel}</Text>
      </Btn>
      {onDelete ? (
        <Btn onPress={() => onDelete()}>
          <Text className="font-bold text-primary-foreground">
            Delete {label || 'cell'}
          </Text>
        </Btn>
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
      <Btn
        onPress={async () => {
          await onSave({
            label,
            xPct: Number(xPct),
            yPct: Number(yPct),
            format,
            registerId,
          });
          if (resetAfterSave && !overlay) resetAddForm();
        }}
      >
        <Text className="font-bold text-primary-foreground">{saveLabel}</Text>
      </Btn>
      {onDelete ? (
        <Btn onPress={() => onDelete()}>
          <Text className="font-bold text-primary-foreground">
            Delete {label || 'label'}
          </Text>
        </Btn>
      ) : null}
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </>
  );
}

function BackgroundScreens({
  screens,
  note,
  onActivate,
  onCreate,
}: {
  screens: Array<{ id: string; name: string; active: boolean }>;
  note?: string;
  onActivate: (id: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
}) {
  const [newName, setNewName] = useState('');
  return (
    <View className="mt-3 gap-2">
      <Text className="text-sm font-semibold text-foreground">
        Plant screens
      </Text>
      {screens.map((screen) => (
        <View
          key={screen.id}
          className="flex-row items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
        >
          <Text className="flex-1 text-sm text-foreground">
            {screen.name}
            {screen.active ? ' · Active' : ''}
          </Text>
          {!screen.active ? (
            <Pressable
              className="min-h-[44px] justify-center rounded-md border border-border px-3"
              onPress={() => void onActivate(screen.id)}
            >
              <Text className="text-sm text-foreground">Activate</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <Field
        label="New screen name"
        value={newName}
        onChangeText={setNewName}
      />
      <Btn
        className="min-h-[44px] mt-0"
        disabled={!newName.trim()}
        onPress={async () => {
          const name = newName.trim();
          if (!name) return;
          await onCreate(name);
          setNewName('');
        }}
      >
        <Text className="font-bold text-primary-foreground">Add screen</Text>
      </Btn>
      {note ? (
        <Text className="my-1 flex-shrink text-success" numberOfLines={3}>
          {note}
        </Text>
      ) : null}
    </View>
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
  useEffect(() => {
    setName(initialName);
    setCss(initialCss);
    setImage(initialImage);
  }, [initialName, initialCss, initialImage]);
  return (
    <>
      <Field label="Name" value={name} onChangeText={setName} />
      <Field
        label="CSS background"
        value={cssBackground}
        onChangeText={setCss}
      />
      <Field label="Image URL" value={imageUrl} onChangeText={setImage} />
      <Btn onPress={() => onSave({ name, cssBackground, imageUrl })}>
        <Text className="font-bold text-primary-foreground">
          Save background
        </Text>
      </Btn>
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
        <View
          key={row.id}
          className="mb-2 overflow-hidden rounded-lg border border-border p-2"
        >
          <Text
            className="text-sm font-medium text-foreground"
            numberOfLines={2}
          >
            {row.name}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={2}>
            {row.register?.name ?? '—'} · {row.compareOp} {row.threshold} ·{' '}
            {normalizeAlarmSeverity(row.severity)}
            {row.enabled ? '' : ' · disabled'}
          </Text>
          <View className="mt-1 flex-row flex-wrap gap-3">
            <Pressable
              className="shrink"
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
              <Text className="text-primary" numberOfLines={1}>
                Edit
              </Text>
            </Pressable>
            <Pressable
              className="shrink"
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
              <Text className="text-primary" numberOfLines={1}>
                {t('delete')}
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
      <Btn onPress={() => saveAlarm()}>
        <Text className="font-bold text-primary-foreground" numberOfLines={1}>
          {editingId ? 'Update alarm' : t('saveAlarm')}
        </Text>
      </Btn>
      {editingId ? (
        <Pressable onPress={resetForm}>
          <Text className="mt-1 text-primary">Cancel edit</Text>
        </Pressable>
      ) : null}
      {note ? (
        <Text
          className="my-2 w-full shrink text-success"
          style={{ flexShrink: 1 }}
          numberOfLines={3}
        >
          {note}
        </Text>
      ) : null}
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
      <Btn
        onPress={async () => {
          try {
            await onSubmit({
              code,
              label,
              kind,
              routeHint: routeHint.trim() || null,
              notes: notes.trim() || null,
            });
            setNote('Saved.');
          } catch (err: unknown) {
            showErrorFrom(err, 'Save failed');
          }
        }}
      >
        <Text className="font-bold text-primary-foreground">{submitLabel}</Text>
      </Btn>
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
      <Btn
        onPress={async () => {
          if (!pin.trim()) {
            showErrorFrom(
              new Error('Reset PIN is required to save safety roles'),
              'Save failed',
            );
            return;
          }
          try {
            await apiPut(
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
            );
            setPin('');
            await roles.refetch();
            setNote('Saved safety roles.');
          } catch (err: unknown) {
            showErrorFrom(err, 'Save failed');
          }
        }}
      >
        <Text className="font-bold text-primary-foreground">
          Save safety roles
        </Text>
      </Btn>
      {note ? <Text className="my-2 text-success">{note}</Text> : null}
    </>
  );
}
