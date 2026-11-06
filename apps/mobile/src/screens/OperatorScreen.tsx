import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { tagValueForRegister, type TagSnapshot } from '@tele-pendant/shared';
import { io, Socket } from 'socket.io-client';
import { operatorApiError } from '../api-errors';
import { apiGet, apiPost, getApiBase } from '../api';
import type { Cell, Layout } from '../types';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import { ESTOP, operatorCell } from '../hmi-styles';
import { useTheme } from '../theme';
import { Banner, Card, showErrorAlert } from '../ui';

function statusTone(mode: string): 'ok' | 'warn' | 'danger' {
  if (mode === 'safe_state' || mode === 'estop' || mode === 'e_stop') {
    return 'danger';
  }
  if (mode !== 'normal' && mode !== 'unknown') return 'warn';
  return 'ok';
}

export function OperatorScreen({ token }: { token: string }) {
  const { t, terror } = useLocale();
  const { theme } = useTheme();
  const cellPalette = operatorCell(theme === 'dark');
  const [pin, setPin] = useState('');
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [safetyMode, setSafetyMode] = useState('unknown');
  const [height, setHeight] = useState<number | null>(null);
  const [tags, setTags] = useState<TagSnapshot | null>(null);
  const [photoOk, setPhotoOk] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const heldId = useRef<string | null>(null);
  /** Bumps on release so in-flight activate(true) cannot leave a coil latched. */
  const holdGen = useRef(0);
  const activatingId = useRef<string | null>(null);
  /** Release arrived while activate(true) was still in flight — finish after pressCell. */
  const releaseAfterActivate = useRef<string | null>(null);

  useEffect(() => {
    let socket: Socket | null = null;
    let closed = false;
    const base = getApiBase();
    if (closed) return;
    const origin = base.replace(/\/api\/v1$/, '');
    socket = io(`${origin}/realtime`, {
      transports: ['websocket', 'polling'],
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: Infinity,
    });
    socketRef.current = socket;
    socket.on('safety.state', (s: { mode: string }) => setSafetyMode(s.mode));
    socket.on('tags.update', (payload: TagSnapshot) => {
      if (typeof payload.hoistHeightMm === 'number') {
        setHeight(payload.hoistHeightMm);
      }
      setTags(payload);
    });
    return () => {
      closed = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const layoutQuery = useQuery({
    queryKey: ['layout', token],
    queryFn: () => apiGet<Layout>('/hmi/layout', token),
  });

  const pulseDeadman = useCallback(async () => {
    socketRef.current?.emit('deadman.pulse');
    await apiPost('/safety/deadman/pulse', undefined, token);
  }, [token]);

  const releaseDeadman = useCallback(() => {
    socketRef.current?.emit('deadman.release');
    void apiPost('/safety/deadman/release', undefined, token).catch(
      () => undefined,
    );
  }, [token]);

  const dropMotionCoil = useCallback(
    async (cellId: string) => {
      try {
        await apiPost(`/hmi/cells/${cellId}/activate`, { value: false }, token);
      } catch {
        // Best-effort coil drop.
      }
    },
    [token],
  );

  const finishMotionRelease = useCallback(
    async (cellId: string) => {
      releaseAfterActivate.current = null;
      setHoldingId((current) => (current === cellId ? null : current));
      releaseDeadman();
      await dropMotionCoil(cellId);
    },
    [dropMotionCoil, releaseDeadman],
  );

  useEffect(() => {
    if (!holdingId) return;
    const id = setInterval(() => {
      socketRef.current?.emit('deadman.pulse');
      void apiPost('/safety/deadman/pulse', undefined, token).catch(
        () => undefined,
      );
    }, 400);
    return () => clearInterval(id);
  }, [holdingId, token]);

  const pressCell = async (cell: Cell) => {
    const pressGen = holdGen.current;
    if (cell.isMotion) {
      heldId.current = cell.id;
      setHoldingId(cell.id);
      releaseAfterActivate.current = null;
    }
    activatingId.current = cell.id;
    try {
      if (cell.isMotion) {
        await pulseDeadman();
      }
      await apiPost(`/hmi/cells/${cell.id}/activate`, { value: true }, token);
    } catch (err) {
      showErrorAlert(
        operatorApiError(
          err,
          cell.style === 'estop' ? 'stop' : 'reset',
          terror,
        ),
      );
      if (heldId.current === cell.id) {
        heldId.current = null;
        setHoldingId(null);
        if (cell.isMotion) releaseDeadman();
      }
      releaseAfterActivate.current = null;
      return;
    } finally {
      if (activatingId.current === cell.id) {
        activatingId.current = null;
      }
    }
    if (cell.isMotion && releaseAfterActivate.current === cell.id) {
      await finishMotionRelease(cell.id);
      return;
    }
    if (
      cell.isMotion &&
      (heldId.current !== cell.id || holdGen.current !== pressGen)
    ) {
      await dropMotionCoil(cell.id);
      if (heldId.current === null) releaseDeadman();
    }
  };

  const releaseCell = async (cell: Cell) => {
    if (!cell.isMotion) return;
    const mine = heldId.current === cell.id;
    if (heldId.current === cell.id) heldId.current = null;
    if (!mine) return;
    holdGen.current += 1;
    if (activatingId.current === cell.id) {
      releaseAfterActivate.current = cell.id;
      return;
    }
    await finishMotionRelease(cell.id);
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        const id = heldId.current;
        heldId.current = null;
        holdGen.current += 1;
        setHoldingId(null);
        releaseDeadman();
        if (!id) return;
        const cell = layoutQuery.data?.cells.find((row) => row.id === id);
        if (!cell?.isMotion) return;
        void apiPost(`/hmi/cells/${id}/activate`, { value: false }, token);
      }
    });
    return () => sub.remove();
  }, [layoutQuery.data?.cells, releaseDeadman, token]);

  const resetEStop = async () => {
    try {
      await apiPost('/safety/reset', { pin }, token);
    } catch (err) {
      showErrorAlert(operatorApiError(err, 'reset', terror));
    }
  };

  const imageUrl = layoutQuery.data?.background?.imageUrl ?? '';
  const cssBackground =
    layoutQuery.data?.background?.cssBackground?.trim() || '';
  // RN View only accepts solid colors (not CSS gradients).
  const solidBackground =
    cssBackground && !/[()]/.test(cssBackground) ? cssBackground : '';
  const tone = statusTone(safetyMode);
  useEffect(() => {
    setPhotoOk(true);
  }, [imageUrl]);

  const grid = useMemo(() => {
    const layout = layoutQuery.data;
    if (!layout) return null;
    const map = new Map(layout.cells.map((c) => [`${c.row}:${c.col}`, c]));
    const cells: Array<Cell | null> = [];
    for (let r = 0; r < layout.matrix.rows; r++) {
      for (let c = 0; c < layout.matrix.cols; c++) {
        cells.push(map.get(`${r}:${c}`) ?? null);
      }
    }
    return { cols: layout.matrix.cols, cells };
  }, [layoutQuery.data]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-1.5 p-2 pb-6"
      scrollEnabled={!holdingId}
      keyboardShouldPersistTaps="handled"
    >
      <HelpTip id="tour.operator.banner">
        <Banner>
          {t('safety')}: {safetyMode}
          {holdingId ? ` · ${t('deadmanHold')}` : ''}
        </Banner>
      </HelpTip>
      <HelpTip id="tour.operator.graphic">
        <View
          className="relative h-[152px] overflow-hidden rounded-xl border border-white/10"
          style={{ backgroundColor: solidBackground || '#07090c' }}
        >
          {imageUrl && photoOk ? (
            <Image
              source={{ uri: imageUrl }}
              className="absolute inset-0 h-full w-full"
              style={{ opacity: 0.32 }}
              onError={() => setPhotoOk(false)}
            />
          ) : null}
          <View
            className="absolute inset-0"
            style={{
              backgroundColor: 'rgba(0,0,0,0.35)',
            }}
          />
          <View className="z-10 flex-row items-center justify-between px-3.5 pb-2 pt-3">
            <Text
              className="flex-1 text-[10px] font-medium uppercase text-white/70"
              style={{ letterSpacing: 2.8 }}
              numberOfLines={1}
            >
              {layoutQuery.data?.background?.name ?? t('plantGraphic')}
            </Text>
            <View className="ml-2 flex-row items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5">
              <View
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor:
                    tone === 'danger'
                      ? '#fb7185'
                      : tone === 'warn'
                        ? '#fcd34d'
                        : '#8fd0c0',
                }}
              />
              <Text
                className="text-[10px] font-medium uppercase text-white/85"
                style={{ letterSpacing: 1.6 }}
              >
                {safetyMode}
              </Text>
            </View>
          </View>
          <View className="absolute inset-x-0 bottom-0 z-10 flex-row border-t border-white/10 bg-[#07090c]/95 px-1 pb-1 pt-1">
            {(
              [
                {
                  label: 'Height',
                  value: String(height ?? tags?.hoistHeightMm ?? '—'),
                  unit: 'mm',
                },
                {
                  label: 'Load',
                  value: String(tags?.loadKg ?? '—'),
                  unit: 'kg',
                },
                {
                  label: 'Motor',
                  value: tags?.motorRunning ? 'RUN' : 'IDLE',
                  unit: 'status',
                },
              ] as const
            ).map((metric, index) => (
              <View
                key={metric.label}
                className={`flex-1 items-center gap-0.5 px-1 py-1 ${
                  index > 0 ? 'border-l border-white/10' : ''
                }`}
              >
                <Text
                  className="text-[9px] font-medium uppercase text-white/45"
                  style={{ letterSpacing: 2 }}
                >
                  {metric.label}
                </Text>
                <Text className="font-mono text-base font-semibold text-white">
                  {metric.value}
                </Text>
                <Text
                  className="text-[10px] uppercase text-white/40"
                  style={{ letterSpacing: 1.2 }}
                >
                  {metric.unit}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </HelpTip>
      <Card compact>
        <HelpTip id="tour.operator.safePin">
          <View className="gap-1">
            <Text className="text-xs text-muted-foreground">
              {t('safePin')}
            </Text>
            <View className="flex-row items-center gap-1">
              <TextInput
                className="h-12 min-h-12 flex-1 rounded-md border border-border bg-input px-3 text-sm text-foreground"
                value={pin}
                onChangeText={setPin}
                secureTextEntry
                autoCapitalize="none"
                placeholder={t('safePin')}
                placeholderTextColor="#5C6B7A"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('resetEstop')}
                className="h-12 min-h-12 shrink-0 items-center justify-center rounded-md border border-border px-2"
                onPress={() => void resetEStop()}
              >
                <Text className="text-xs font-semibold text-foreground">
                  {t('resetEstop')}
                </Text>
              </Pressable>
            </View>
          </View>
        </HelpTip>
        <HelpTip id="tour.operator.matrix">
          <View className="mt-1 gap-[22px]">
            {grid &&
              grid.cells.map((cell) => {
                if (!cell) return null;
                const isEstop = cell.style === 'estop';
                const holding = holdingId === cell.id;
                const labelColor = isEstop
                  ? ESTOP.foreground
                  : cellPalette.foreground;
                const metaColor = isEstop
                  ? 'rgba(255,255,255,0.85)'
                  : cellPalette.meta;
                return (
                  <Pressable
                    key={cell.id}
                    accessibilityRole="button"
                    accessibilityLabel={cell.label}
                    className="min-h-16 w-full flex-row flex-nowrap items-center justify-between gap-2 rounded-md border px-3 py-3.5"
                    style={{
                      backgroundColor: isEstop
                        ? ESTOP.background
                        : cellPalette.background,
                      borderColor: holding
                        ? '#3dd68c'
                        : isEstop
                          ? ESTOP.border
                          : cellPalette.border,
                      borderWidth: holding ? 2 : 1,
                    }}
                    onPressIn={() => {
                      void pressCell(cell);
                    }}
                    onPressOut={() => {
                      void releaseCell(cell);
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      className="shrink-0 text-base font-semibold"
                      style={{ color: labelColor }}
                    >
                      {cell.label}
                    </Text>
                    {cell.feedbackRegister || cell.statusRegister ? (
                      <Text
                        numberOfLines={1}
                        className="shrink-0 text-[10px] opacity-80"
                        style={{ color: metaColor }}
                      >
                        {cell.feedbackRegister
                          ? `F ${String(
                              tagValueForRegister(
                                tags,
                                cell.feedbackRegister.name,
                              ),
                            )}`
                          : ''}
                        {cell.feedbackRegister && cell.statusRegister
                          ? ' · '
                          : ''}
                        {cell.statusRegister
                          ? `S ${String(
                              tagValueForRegister(
                                tags,
                                cell.statusRegister.name,
                              ),
                            )}`
                          : ''}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
          </View>
        </HelpTip>
      </Card>
    </ScrollView>
  );
}
