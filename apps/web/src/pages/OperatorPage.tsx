import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HTMLAttributes, PointerEvent as ReactPointerEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Circle, Play, ShieldAlert } from 'lucide-react';
import { apiGet, apiPost, CellDto, HmiLayout, LiveTags } from '../lib/api';
import { useT } from '../lib/i18n';
import {
  formatOverlay,
  isClusterMetricRegister,
  tagValueForRegister,
} from '../lib/operator-helpers';
import {
  cellPulsesDeadman,
  cellRequiresControlLease,
  cellUsesHoldToRun,
  containedImageRect,
  isOperatorStopCell,
  isOperatorScreenReady,
  MATRIX_CELL_STATE_CODE,
  MATRIX_CELL_STATE_I18N,
  operatorNeedsLiveTags,
  parseSelectorSideLabels,
  resolveMatrixCellUiState,
  type MatrixCellUiState,
} from '@tele-pendant/shared';
import { useControlLease } from '../lib/control-lease';
import { applyLiveTagsState, shouldApplyLiveTags } from '../lib/live-tags';
import { motionDebug } from '../lib/motion-debug';
import { getRealtimeSocket } from '../lib/realtime';
import { HelpTip } from '../lib/tour';
import { PageSpinner } from '@/components/page-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  armTouchPress,
  clearTouchArms,
  isTouchPointer,
  noteTouchScroll,
  settleTouchPress,
  type TouchArm,
} from '@/lib/touch-press';

const CELL_STATE_ICON: Record<MatrixCellUiState, typeof Circle> = {
  idle: Circle,
  running: Play,
  blocked: Ban,
  fault: AlertTriangle,
};

function pointerLeftElement(
  element: Element,
  clientX: number,
  clientY: number,
): boolean {
  const rect = element.getBoundingClientRect();
  return (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  );
}

function trySetPointerCapture(target: HTMLElement, pointerId: number): void {
  try {
    if (typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(pointerId);
    }
  } catch {
    // TP-31: touch/synthetic pointers can throw InvalidStateError.
  }
}

function releasePointerIfCaptured(
  target: HTMLElement,
  pointerId: number,
): void {
  try {
    if (
      typeof target.releasePointerCapture === 'function' &&
      typeof target.hasPointerCapture === 'function' &&
      target.hasPointerCapture(pointerId)
    ) {
      target.releasePointerCapture(pointerId);
    }
  } catch {
    // TP-31: release can throw if capture was never held.
  }
}

type HeldButton = {
  cellId: string;
  cell: CellDto;
  direction: 'a' | 'b' | null;
  gen: number;
  pulses: boolean;
};

function holdKey(cellId: string, direction?: 'a' | 'b' | null): string {
  return direction ? `${cellId}:${direction}` : cellId;
}

function cellIsHeld(
  holds: Map<string, HeldButton>,
  cellId: string,
  direction?: 'a' | 'b',
): boolean {
  if (direction) return holds.has(holdKey(cellId, direction));
  for (const key of holds.keys()) {
    if (key === cellId || key.startsWith(`${cellId}:`)) return true;
  }
  return false;
}

export function readPlantImageRect(
  frame: HTMLElement | null,
  img: HTMLImageElement | null,
) {
  if (!frame || !img?.naturalWidth || !img.naturalHeight) return null;
  const box = frame.getBoundingClientRect();
  return containedImageRect(
    box.width,
    box.height,
    img.naturalWidth,
    img.naturalHeight,
  );
}

function isPlacedOnPicture(cell: CellDto): boolean {
  return (
    cell.xPct != null &&
    cell.yPct != null &&
    cell.style !== 'estop' &&
    cell.style !== 'selector' &&
    cell.label.trim().toUpperCase() !== 'STOP'
  );
}

export function OperatorPage() {
  const queryClient = useQueryClient();
  const { t, terror } = useT();
  const { control, youHold } = useControlLease();
  const controlRef = useRef(control);
  const [tags, setTags] = useState<LiveTags | null>(null);
  const [safety, setSafety] = useState<HmiLayout['safety'] | null>(null);
  const holdsRef = useRef(new Map<string, HeldButton>());
  const [heldVersion, setHeldVersion] = useState(0);
  const bumpHolds = () => setHeldVersion((n) => n + 1);
  const [jogSpeed, setJogSpeed] = useState<'slow' | 'fast'>('fast');
  const jogSpeedRef = useRef<'slow' | 'fast'>('fast');
  const [safePin, setSafePin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [photoOk, setPhotoOk] = useState(true);
  const [liveFallback, setLiveFallback] = useState(false);
  const tagOrderRef = useRef<{ lastSeq: number; lastAt: string | null }>({
    lastSeq: 0,
    lastAt: null,
  });
  const tagsPullInFlight = useRef(false);
  const lastWsTagAt = useRef(0);
  const holdPulseCount = useRef(0);
  const lastTagLogAt = useRef(0);
  const touchArms = useRef(new Map<number, TouchArm>());

  const applyLiveTags = useCallback((payload: LiveTags) => {
    if (
      !shouldApplyLiveTags(
        tagOrderRef.current.lastSeq,
        tagOrderRef.current.lastAt,
        payload,
      )
    ) {
      motionDebug('tags.dropped-stale', {
        seq: payload.seq,
        at: payload.at,
        lastSeq: tagOrderRef.current.lastSeq,
        lastAt: tagOrderRef.current.lastAt,
      });
      return;
    }
    tagOrderRef.current = applyLiveTagsState(tagOrderRef.current, payload);
    const now = Date.now();
    if (holdsRef.current.size > 0 || now - lastTagLogAt.current > 1000) {
      lastTagLogAt.current = now;
      motionDebug('tags.apply', {
        seq: payload.seq,
        at: payload.at,
        hoistHeightMm: payload.hoistHeightMm,
        trolleyPositionMm: payload.trolleyPositionMm,
        holding: holdsRef.current.size,
      });
    }
    setTags((prev) => ({
      ...prev,
      ...payload,
      values: { ...prev?.values, ...payload.values },
    }));
  }, []);

  useEffect(() => {
    controlRef.current = control;
  }, [control]);

  useEffect(() => {
    jogSpeedRef.current = jogSpeed;
  }, [jogSpeed]);

  const layoutQuery = useQuery({
    queryKey: ['hmi-layout'],
    queryFn: () => apiGet<HmiLayout>('/hmi/layout'),
  });

  useEffect(() => {
    const socket = getRealtimeSocket();
    const onTags = (payload: LiveTags) => {
      lastWsTagAt.current = Date.now();
      applyLiveTags(payload);
    };
    const onSafety = (payload: HmiLayout['safety']) => {
      if (holdsRef.current.size > 0) {
        const pulseAt = (payload as { lastClientPulseAt?: string | null })
          .lastClientPulseAt;
        motionDebug('safety.state', {
          mode: payload.mode,
          deadmanActive: payload.deadmanActive,
          eStopActive: payload.eStopActive,
          lastClientPulseAt: pulseAt ?? null,
        });
      }
      setSafety(payload);
    };
    const onConnect = () => {
      motionDebug('ws.connect', {
        id: socket.id,
        transport: socket.io?.engine?.transport?.name,
      });
    };
    const onDisconnect = (reason: string) => {
      motionDebug('ws.disconnect', {
        reason,
        holding: holdsRef.current.size,
        msSinceLastTag: Date.now() - (lastWsTagAt.current || Date.now()),
      });
    };
    const onReconnect = (attempt: number) => {
      motionDebug('ws.reconnect', {
        attempt,
        id: socket.id,
        transport: socket.io?.engine?.transport?.name,
      });
    };
    socket.on('tags.update', onTags);
    socket.on('safety.state', onSafety);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io?.on('reconnect', onReconnect);
    return () => {
      socket.off('tags.update', onTags);
      socket.off('safety.state', onSafety);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io?.off('reconnect', onReconnect);
    };
  }, [applyLiveTags]);

  /**
   * HTTP tags only when Socket.IO has gone quiet (prod proxy stall).
   * When WS is healthy — same path as local — do not poll REST.
   */
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const socket = getRealtimeSocket();
      if (socket.connected && Date.now() - lastWsTagAt.current < 4_000) {
        return;
      }
      if (tagsPullInFlight.current) return;
      tagsPullInFlight.current = true;
      motionDebug('tags.http-fallback', {
        msSinceWsTag: Date.now() - (lastWsTagAt.current || 0),
        socketConnected: socket.connected,
      });
      try {
        const payload = await apiGet<LiveTags & { at: string | null }>(
          '/realtime/tags',
        );
        if (cancelled || payload.at == null) return;
        applyLiveTags(payload);
      } catch {
        // ignore transient errors
      } finally {
        tagsPullInFlight.current = false;
      }
    };
    void pull();
    const id = window.setInterval(pull, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [applyLiveTags]);

  // Match the local working hold path: WS deadman pulse only (no HTTP flood).
  // Only motion/jog holds refresh deadman — Enable/PB holds must not.
  useEffect(() => {
    const socket = getRealtimeSocket();
    const motionHold = [...holdsRef.current.values()].find((hold) => {
      const heldCell = layoutQuery.data?.cells.find(
        (c) => c.id === hold.cellId,
      );
      return Boolean(heldCell && cellPulsesDeadman(heldCell));
    });
    if (!motionHold) return;
    holdPulseCount.current = 0;
    const pulse = () => {
      holdPulseCount.current += 1;
      const n = holdPulseCount.current;
      motionDebug('hold.pulse', {
        n,
        cellId: motionHold.cellId,
        socketConnected: socket.connected,
        transport: socket.io?.engine?.transport?.name,
        msSinceLastTag: Date.now() - (lastWsTagAt.current || Date.now()),
      });
      socket.emit('deadman.pulse');
    };
    pulse();
    const id = window.setInterval(pulse, 400);
    return () => window.clearInterval(id);
  }, [heldVersion, layoutQuery.data?.cells]);

  const activate = useMutation({
    mutationFn: (args: {
      id: string;
      value: boolean;
      safeActionPin?: string;
      speed?: 'slow' | 'fast';
      direction?: 'a' | 'b';
    }) =>
      apiPost(`/hmi/cells/${args.id}/activate`, {
        value: args.value,
        safeActionPin: args.safeActionPin,
        ...(args.speed ? { speed: args.speed } : {}),
        ...(args.direction ? { direction: args.direction } : {}),
      }),
    onError: (err: Error) => setMessage(err.message),
    onSuccess: () => {
      setMessage(null);
      void queryClient.invalidateQueries({ queryKey: ['hmi-layout'] });
    },
  });

  const pulseDeadman = useCallback(() => {
    // WS only — HTTP pulse/release doubled Modbus coil drops with the WS path.
    getRealtimeSocket().emit('deadman.pulse');
  }, []);

  const releaseDeadman = useCallback(() => {
    getRealtimeSocket().emit('deadman.release');
  }, []);

  const grid = useMemo(() => {
    const layout = layoutQuery.data;
    if (!layout) return null;
    const { rows, cols } = layout.matrix;
    const map = new Map(
      layout.cells
        .filter((cell) => !isPlacedOnPicture(cell))
        .map((c) => [`${c.row}:${c.col}`, c]),
    );
    const cells: Array<CellDto | null> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push(map.get(`${r}:${c}`) ?? null);
      }
    }
    return { rows, cols, cells };
  }, [layoutQuery.data]);

  function motionStillHeld() {
    for (const hold of holdsRef.current.values()) {
      if (hold.pulses) return true;
    }
    return false;
  }

  function dropCoil(cell: CellDto, direction?: 'a' | 'b' | null) {
    const t0 = Date.now();
    void activate
      .mutateAsync({
        id: cell.id,
        value: false,
        speed:
          cell.isMotion && (cell.variableSpeed ?? true)
            ? jogSpeedRef.current
            : undefined,
        ...(direction ? { direction } : {}),
      })
      .then(() => {
        motionDebug('hold.activate-false', {
          cellId: cell.id,
          ms: Date.now() - t0,
        });
      })
      .catch((err: unknown) => {
        motionDebug('hold.activate-false.fail', {
          cellId: cell.id,
          ms: Date.now() - t0,
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }

  async function pressCell(cell: CellDto, direction?: 'a' | 'b') {
    setMessage(null);
    const needsLease = cellRequiresControlLease(cell);
    if (needsLease && !controlRef.current?.youHold) {
      setMessage(
        controlRef.current?.held
          ? `${t('controlHeldBy')} ${controlRef.current.holderDisplayName || controlRef.current.holderUserId}`
          : t('err.control'),
      );
      return;
    }
    const holdToRun = cellUsesHoldToRun(cell);
    const key = holdKey(cell.id, direction);
    const pressGen = holdsRef.current.get(key)?.gen ?? 0;
    if (holdToRun) {
      motionDebug('hold.press', {
        cellId: cell.id,
        label: cell.label,
        direction: direction ?? null,
        speed: jogSpeedRef.current,
      });
      holdsRef.current.set(key, {
        cellId: cell.id,
        cell,
        direction: direction ?? null,
        gen: pressGen,
        pulses: cellPulsesDeadman(cell),
      });
      bumpHolds();
      if (cellPulsesDeadman(cell)) pulseDeadman();
    }
    const speed =
      cell.isMotion && (cell.variableSpeed ?? true)
        ? jogSpeedRef.current
        : undefined;
    const t0 = Date.now();
    try {
      await activate.mutateAsync({
        id: cell.id,
        value: true,
        speed,
        ...(direction ? { direction } : {}),
      });
      const held = holdsRef.current.get(key);
      if (holdToRun && (!held || held.gen !== pressGen)) {
        // Released while activate(true) was in flight — drop the coil.
        dropCoil(cell, direction);
        return;
      }
      if (holdToRun) {
        motionDebug('hold.activate-true', {
          cellId: cell.id,
          ms: Date.now() - t0,
        });
      }
    } catch (err) {
      if (holdToRun) {
        motionDebug('hold.activate-true.fail', {
          cellId: cell.id,
          ms: Date.now() - t0,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      const held = holdsRef.current.get(key);
      if (held && held.gen === pressGen) {
        holdsRef.current.delete(key);
        bumpHolds();
        if (cellPulsesDeadman(cell) && !motionStillHeld()) releaseDeadman();
      }
    }
  }

  function releaseCell(cell: CellDto, direction?: 'a' | 'b') {
    if (!cellUsesHoldToRun(cell)) return;
    const key = holdKey(cell.id, direction);
    const held = holdsRef.current.get(key);
    if (!held) return;
    holdsRef.current.delete(key);
    const dropped: Array<{ cell: CellDto; direction: 'a' | 'b' | null }> = [];
    if (cell.style === 'enable') {
      for (const [otherKey, otherHold] of [...holdsRef.current.entries()]) {
        if (!otherHold.pulses) continue;
        holdsRef.current.delete(otherKey);
        dropped.push({ cell: otherHold.cell, direction: otherHold.direction });
      }
    }
    bumpHolds();
    motionDebug('hold.release', {
      cellId: cell.id,
      label: cell.label,
      direction: held.direction,
      pulses: holdPulseCount.current,
    });
    if (!motionStillHeld()) releaseDeadman();
    // Fire-and-forget: awaiting activate-false stacked Modbus work behind the
    // next press and caused live-tag jumps in prod (700–2500ms).
    dropCoil(cell, held.direction);
    for (const item of dropped) dropCoil(item.cell, item.direction);
  }

  async function clearSelector(cell: CellDto) {
    setMessage(null);
    try {
      await activate.mutateAsync({ id: cell.id, value: false });
    } catch {
      // Best-effort center clear.
    }
  }

  function finishCellPointer(
    cell: CellDto,
    target: HTMLElement,
    pointerId: number,
    direction?: 'a' | 'b',
  ) {
    releasePointerIfCaptured(target, pointerId);
    void releaseCell(cell, direction);
  }

  useEffect(() => {
    const arms = touchArms.current;
    return () => clearTouchArms(arms);
  }, []);

  useEffect(() => {
    const dropHeld = () => {
      const held = [...holdsRef.current.values()];
      if (held.length === 0) return;
      holdsRef.current.clear();
      bumpHolds();
      releaseDeadman();
      for (const hold of held) {
        const cell = layoutQuery.data?.cells.find(
          (row) => row.id === hold.cellId,
        );
        if (!cell || !cellUsesHoldToRun(cell)) continue;
        void apiPost(`/hmi/cells/${hold.cellId}/activate`, {
          value: false,
          ...(hold.direction ? { direction: hold.direction } : {}),
        }).catch(() => undefined);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') dropHeld();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', dropHeld);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', dropHeld);
    };
  }, [layoutQuery.data?.cells, releaseDeadman]);

  useEffect(() => {
    const modeNow = safety?.mode ?? layoutQuery.data?.safety.mode;
    if (holdsRef.current.size > 0) return;
    if (modeNow === 'normal' && !safety?.eStopActive) {
      setMessage((current) =>
        current && /motion blocked/i.test(current) ? null : current,
      );
    }
  }, [safety, layoutQuery.data]);

  async function resetEStop() {
    setMessage(null);
    try {
      await apiPost('/safety/reset', { pin: safePin });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'PIN does not match');
    }
  }

  const layout = layoutQuery.data;
  const needsLive = useMemo(() => operatorNeedsLiveTags(layout), [layout]);
  const showJogSpeed = useMemo(
    () =>
      !layout?.cells.some((cell) => cell.style === 'selector') &&
      Boolean(
        layout?.cells.some(
          (cell) => cell.isMotion && (cell.variableSpeed ?? true),
        ),
      ),
    [layout?.cells],
  );
  const imageUrl = layout?.background?.imageUrl ?? '';
  const cssBackground = layout?.background?.cssBackground?.trim() || '';
  const mode = safety?.mode ?? layout?.safety.mode ?? 'unknown';
  const screens = layout?.backgrounds ?? [];
  const useCustomGraphic = Boolean(imageUrl && photoOk);
  const graphicRef = useRef<HTMLDivElement>(null);
  const plantImgRef = useRef<HTMLImageElement>(null);
  const [imageRect, setImageRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  async function switchScreen(id: string) {
    if (layout?.background?.id === id) return;
    try {
      await apiPost(`/hmi/backgrounds/${id}/select`);
      await queryClient.invalidateQueries({ queryKey: ['hmi-layout'] });
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : 'Could not switch screen',
      );
    }
  }

  useEffect(() => {
    if (!needsLive || tags) {
      setLiveFallback(false);
      return;
    }
    const id = window.setTimeout(() => setLiveFallback(true), 2500);
    return () => window.clearTimeout(id);
  }, [needsLive, tags, layout]);

  useEffect(() => {
    setPhotoOk(true);
  }, [imageUrl]);

  const operatorReady = isOperatorScreenReady({
    layoutLoaded: Boolean(layout),
    gridReady: Boolean(grid),
    needsLive,
    hasTags: tags !== null,
    liveFallback,
  });

  useEffect(() => {
    if (!useCustomGraphic || !operatorReady) {
      setImageRect(null);
      return;
    }
    const frame = graphicRef.current;
    const img = plantImgRef.current;
    const measure = () => {
      setImageRect(readPlantImageRect(frame, img));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame as HTMLDivElement);
    (img as HTMLImageElement).addEventListener('load', measure);
    return () => {
      observer.disconnect();
      (img as HTMLImageElement).removeEventListener('load', measure);
    };
  }, [useCustomGraphic, imageUrl, operatorReady]);

  if (layoutQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {layoutQuery.error instanceof Error
            ? layoutQuery.error.message
            : 'Could not load operator screen'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!operatorReady || !layout || !grid) {
    return <PageSpinner label={t('operator')} />;
  }

  const hasPicture = Boolean(layout.background?.imageUrl);
  const hasSelectors = layout.cells.some((cell) => cell.style === 'selector');
  const isPendantScreen = hasPicture || hasSelectors;
  const placedCells = layout.cells.filter((cell) => isPlacedOnPicture(cell));

  const stopCell =
    layout.stop ??
    grid.cells.find(
      (cell) =>
        cell &&
        (cell.style === 'estop' || cell.label.trim().toUpperCase() === 'STOP'),
    ) ??
    null;

  function renderMatrixCell(cell: CellDto) {
    const cellState = resolveMatrixCellUiState({
      style: cell.style,
      isMotion: cell.isMotion,
      isHolding: cellIsHeld(holdsRef.current, cell.id),
      safety: safety ?? layout!.safety,
      tags,
      statusRegisterName: cell.statusRegister?.name,
    });
    const StateIcon = CELL_STATE_ICON[cellState];
    const isEstop = cell.style === 'estop';
    const estopLatched =
      isEstop &&
      (Boolean(safety?.eStopActive) ||
        (safety?.mode ?? '').toLowerCase() === 'e_stop');
    const stateLabel = estopLatched
      ? t('estop')
      : t(MATRIX_CELL_STATE_I18N[cellState]);
    const stateCode = estopLatched ? 'STOP' : MATRIX_CELL_STATE_CODE[cellState];
    const needsLease = cellRequiresControlLease(cell);
    const holdToRun = cellUsesHoldToRun(cell);
    const isLamp = cell.style === 'lamp';
    const lampRegisterName = isLamp
      ? cell.primaryRegister?.name
      : cell.feedbackRegister?.name;
    const feedbackRaw = lampRegisterName
      ? tagValueForRegister(tags, lampRegisterName)
      : undefined;
    const feedbackIsBool =
      typeof feedbackRaw === 'boolean' ||
      feedbackRaw === 0 ||
      feedbackRaw === 1 ||
      feedbackRaw === 'true' ||
      feedbackRaw === 'false';
    const lampOn =
      feedbackRaw === true ||
      feedbackRaw === 1 ||
      feedbackRaw === 'true' ||
      feedbackRaw === '1';
    const releaseHeldPointer = (direction?: 'a' | 'b') => {
      if (holdToRun && cellIsHeld(holdsRef.current, cell.id, direction)) {
        void releaseCell(cell, direction);
      }
    };
    const feedbackLamp =
      Boolean(cell.feedbackRegister) && feedbackIsBool ? (
        <span
          className={cn('matrix-lamp size-3', lampOn && 'is-on')}
          title={lampOn ? 'Lamp on' : 'Lamp off'}
          data-lamp={lampOn ? 'on' : 'off'}
          aria-hidden
        />
      ) : null;
    const pointerHandlers = (
      direction?: 'a' | 'b',
    ): Pick<
      HTMLAttributes<HTMLElement>,
      | 'onPointerDown'
      | 'onPointerMove'
      | 'onPointerUp'
      | 'onPointerLeave'
      | 'onPointerCancel'
    > => {
      const commit = () => {
        void pressCell(cell, direction);
      };
      const finish = (event: ReactPointerEvent<HTMLElement>) => {
        finishCellPointer(
          cell,
          event.currentTarget,
          event.pointerId,
          direction,
        );
      };
      return {
        onPointerDown: (event) => {
          if (isTouchPointer(event.pointerType)) {
            armTouchPress(
              touchArms.current,
              event.pointerId,
              event.clientX,
              event.clientY,
              commit,
              () => trySetPointerCapture(event.currentTarget, event.pointerId),
              isOperatorStopCell(cell),
            );
            return;
          }
          event.preventDefault();
          if (needsLease && !youHold) {
            commit();
            return;
          }
          trySetPointerCapture(event.currentTarget, event.pointerId);
          commit();
        },
        onPointerMove: (event) => {
          if (isTouchPointer(event.pointerType)) {
            if (
              noteTouchScroll(
                touchArms.current,
                event.pointerId,
                event.clientX,
                event.clientY,
              )
            ) {
              finish(event);
            }
            return;
          }
          if (!holdToRun || !cellIsHeld(holdsRef.current, cell.id, direction)) {
            return;
          }
          if (
            pointerLeftElement(
              event.currentTarget,
              event.clientX,
              event.clientY,
            )
          ) {
            finish(event);
          }
        },
        onPointerUp: (event) => {
          if (isTouchPointer(event.pointerType)) {
            const scrolling = noteTouchScroll(
              touchArms.current,
              event.pointerId,
              event.clientX,
              event.clientY,
            );
            const effect = settleTouchPress(
              touchArms.current,
              event.pointerId,
              'up',
            );
            if (!scrolling && effect === 'tap') commit();
            if (effect === 'tap' || effect === 'release' || scrolling) {
              finish(event);
            }
            return;
          }
          finish(event);
        },
        onPointerLeave: (event) => {
          if (isTouchPointer(event.pointerType)) return;
          finish(event);
        },
        onPointerCancel: (event) => {
          if (isTouchPointer(event.pointerType)) {
            const effect = settleTouchPress(
              touchArms.current,
              event.pointerId,
              'cancel',
            );
            if (effect === 'release') finish(event);
            return;
          }
          finish(event);
        },
      };
    };
    const statusChip = (
      <span className="matrix-cell-trailing">
        {cell.feedbackRegister && feedbackIsBool ? (
          <span
            className={cn('matrix-lamp', lampOn && 'is-on')}
            title={lampOn ? 'Lamp on' : 'Lamp off'}
            data-lamp={lampOn ? 'on' : 'off'}
            aria-hidden
          />
        ) : null}
        {cell.feedbackRegister && !feedbackIsBool ? (
          <span className="matrix-cell-meta">F {String(feedbackRaw)}</span>
        ) : null}
        {cell.statusRegister ? (
          <span className="matrix-cell-meta">
            S {String(tagValueForRegister(tags, cell.statusRegister.name))}
          </span>
        ) : null}
        <span className="matrix-cell-state" title={stateLabel}>
          <StateIcon className="size-2.5 shrink-0" strokeWidth={2.5} />
          {stateCode}
        </span>
      </span>
    );

    if (cell.style === 'selector') {
      const { sideA, sideB } = parseSelectorSideLabels(cell.label);
      const latch = !holdToRun;
      const aActive = cellIsHeld(holdsRef.current, cell.id, 'a')
        ? true
        : Boolean(tagValueForRegister(tags, cell.primaryRegister?.name));
      const bActive = cellIsHeld(holdsRef.current, cell.id, 'b')
        ? true
        : Boolean(tagValueForRegister(tags, cell.secondaryRegister?.name));
      const rocker = (
        <div
          className={cn('pendant-rocker', `state-${cellState}`)}
          data-cell-state={cellState}
        >
          {(['a', 'b'] as const).map((dir) => {
            const caption = dir === 'a' ? sideA : sideB;
            const active = dir === 'a' ? aActive : bActive;
            const sideVariant = active ? 'default' : 'secondary';
            return (
              <Button
                key={dir}
                type="button"
                variant={sideVariant}
                size="sm"
                className={cn(
                  'matrix-selector-side flex-1 h-full min-h-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-none border-0 bg-transparent px-1.5 text-[8px] normal-case leading-none tracking-normal shadow-none hover:bg-transparent',
                  active && 'is-active',
                )}
                disabled={needsLease && !youHold}
                aria-label={`${cell.label} ${caption}`}
                aria-pressed={active}
                {...pointerHandlers(dir)}
                onLostPointerCapture={() => releaseHeldPointer(dir)}
              >
                {caption}
              </Button>
            );
          })}
          {cell.feedbackRegister && feedbackIsBool ? (
            <span
              className={cn(
                'matrix-lamp pointer-events-none self-center',
                lampOn && 'is-on',
              )}
              title={lampOn ? 'Lamp on' : 'Lamp off'}
              data-lamp={lampOn ? 'on' : 'off'}
              aria-hidden
            />
          ) : null}
          {latch ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="matrix-selector-center h-full min-h-0 w-3 flex-none rounded-none border-0 px-0 shadow-none"
              aria-label={`${cell.label} center`}
              onClick={() => void clearSelector(cell)}
            >
              ·
            </Button>
          ) : null}
        </div>
      );
      return (
        <div
          key={cell.id}
          className="pendant-slot"
          title={`${cell.label} · ${stateCode}: ${stateLabel}`}
        >
          {rocker}
          <p className="pendant-legend">{cell.label}</p>
        </div>
      );
    }

    if (hasSelectors && !isEstop) {
      if (isLamp) {
        return (
          <div
            key={cell.id}
            className="pendant-slot"
            title={`${cell.label} · ${lampOn ? 'ON' : 'OFF'}`}
          >
            <div
              role="status"
              data-cell-state="idle"
              data-lamp={lampOn ? 'on' : 'off'}
              className={cn(
                'pendant-cap flex h-auto w-auto min-h-0 min-w-0 max-h-full max-w-full items-center justify-center rounded-full border border-border bg-muted/40 p-0',
                lampOn && 'ring-2 ring-emerald-500/70',
              )}
              aria-label={`${cell.label}: ${lampOn ? 'on' : 'off'}`}
            >
              <span
                className={cn('matrix-lamp size-4', lampOn && 'is-on')}
                title={lampOn ? 'Lamp on' : 'Lamp off'}
                aria-hidden
              />
            </div>
            <p className="pendant-legend">{cell.label}</p>
          </div>
        );
      }
      return (
        <div
          key={cell.id}
          className="pendant-slot"
          title={`${cell.label} · ${stateCode}: ${stateLabel}`}
        >
          <Button
            type="button"
            variant="secondary"
            data-cell-state={cellState}
            data-touch-min="44"
            className={cn(
              'pendant-cap h-auto w-auto min-h-0 min-w-0 max-h-full max-w-full rounded-full p-0',
              `state-${cellState}`,
              cell.style === 'enable' && 'matrix-enable',
            )}
            disabled={needsLease && !youHold}
            {...pointerHandlers()}
            onLostPointerCapture={() => releaseHeldPointer()}
            aria-label={cell.label}
            aria-description={`${stateCode}: ${stateLabel}`}
          >
            {feedbackLamp}
          </Button>
          <p className="pendant-legend">{cell.label}</p>
        </div>
      );
    }

    if (isLamp) {
      return (
        <div
          key={cell.id}
          role="status"
          data-cell-state="idle"
          data-lamp={lampOn ? 'on' : 'off'}
          className="matrix-cell flex h-full min-h-0 flex-row items-center justify-between gap-1 whitespace-normal border border-border bg-muted/30 px-1 py-px text-[10px]"
          aria-label={`${cell.label}: ${lampOn ? 'on' : 'off'}`}
          title={`${cell.label} · ${lampOn ? 'ON' : 'OFF'}`}
        >
          <span className="matrix-cell-label">{cell.label}</span>
          <span
            className={cn('matrix-lamp size-3', lampOn && 'is-on')}
            aria-hidden
          />
        </div>
      );
    }

    return (
      <Button
        key={cell.id}
        type="button"
        variant={isEstop ? 'destructive' : 'secondary'}
        data-cell-state={cellState}
        data-touch-min="44"
        data-stop-dock={isEstop ? 'true' : undefined}
        className={cn(
          'matrix-cell flex h-full min-h-0 flex-row items-center justify-between gap-1 whitespace-normal px-1 py-px text-[10px]',
          `state-${cellState}`,
          isEstop && 'estop',
          cell.style === 'enable' && 'matrix-enable',
        )}
        disabled={needsLease && !youHold}
        {...pointerHandlers()}
        onLostPointerCapture={() => releaseHeldPointer()}
        aria-label={cell.label}
        aria-description={`${stateCode}: ${stateLabel}`}
        title={`${cell.label} · ${stateCode}: ${stateLabel}`}
      >
        <span className="matrix-cell-label">{cell.label}</span>
        {statusChip}
      </Button>
    );
  }

  return (
    <div
      className="operator-shell mx-auto max-w-6xl gap-1"
      data-feat="hmi-shell"
      data-pendant={isPendantScreen ? 'screen' : undefined}
      data-face={hasSelectors ? 'round' : undefined}
    >
      <div className="operator-body">
        <HelpTip id="tour.operator.banner">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card px-2 py-0.5">
            <ShieldAlert className="size-3.5 text-muted-foreground" />
            <span className="text-xs">
              {t('safety')}: <strong>{mode}</strong>
            </span>
            {safety?.deadmanActive ||
            (heldVersion >= 0 && holdsRef.current.size > 0) ? (
              <Badge variant="secondary">{t('deadmanHold')}</Badge>
            ) : null}
            {safety?.eStopActive ? (
              <Badge variant="destructive" className="estop-mark">
                {t('estop')}
              </Badge>
            ) : null}
          </div>
        </HelpTip>

        {message ? (
          <Alert variant="destructive">
            <AlertDescription>{terror(message)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="operator-hmi-split">
          {screens.length > 1 ? (
            <div
              className="flex shrink-0 flex-wrap gap-1"
              role="tablist"
              aria-label="Plant screens"
            >
              {screens.map((screen) => {
                const chosen = screen.id === layout.background?.id;
                return (
                  <Button
                    key={screen.id}
                    type="button"
                    size="sm"
                    variant={chosen ? 'default' : 'outline'}
                    className="h-6 px-2 text-[10px]"
                    aria-selected={chosen}
                    onClick={() => void switchScreen(screen.id)}
                  >
                    {screen.name}
                  </Button>
                );
              })}
            </div>
          ) : null}
          <HelpTip id="tour.operator.graphic" className="operator-plant-slot">
            <div
              ref={graphicRef}
              className="plant-graphic"
              data-feat="hmi-graphic"
              data-graphic-mode={useCustomGraphic ? 'asset' : 'mimic'}
              style={cssBackground ? { background: cssBackground } : undefined}
            >
              {useCustomGraphic ? (
                <img
                  ref={plantImgRef}
                  alt="Plant background"
                  src={imageUrl}
                  onError={() => setPhotoOk(false)}
                />
              ) : (
                <p className="plant-empty">no picture</p>
              )}
              <div className="plant-cluster-chrome">
                <h2 className="plant-cluster-title">
                  {layout.background?.name ?? t('plantGraphic')}
                </h2>
                <div
                  className={cn(
                    'plant-cluster-status',
                    safety?.eStopActive && 'estop-mark',
                  )}
                >
                  <span
                    className={cn(
                      'plant-cluster-status-dot',
                      (safety?.eStopActive || mode === 'safe_state') &&
                        'danger',
                      !safety?.eStopActive &&
                        mode !== 'normal' &&
                        mode !== 'safe_state' &&
                        'warn',
                    )}
                  />
                  {mode}
                </div>
              </div>
              <div
                className="plant-overlay-stage"
                style={
                  imageRect
                    ? {
                        left: imageRect.left,
                        top: imageRect.top,
                        width: imageRect.width,
                        height: imageRect.height,
                        right: 'auto',
                        bottom: 'auto',
                      }
                    : undefined
                }
              >
                {(layout.overlays ?? [])
                  .filter((o) => !isClusterMetricRegister(o.register?.name))
                  .map((o) => (
                    <div
                      key={o.id}
                      className="plant-overlay"
                      style={{ left: `${o.xPct}%`, top: `${o.yPct}%` }}
                    >
                      <span className="plant-overlay-label">{o.label}</span>
                      <strong className="plant-overlay-value">
                        {formatOverlay(
                          o.format,
                          tagValueForRegister(tags, o.register?.name),
                        )}
                      </strong>
                    </div>
                  ))}
                {placedCells.map((cell) => (
                  <Button
                    key={cell.id}
                    type="button"
                    variant="secondary"
                    className="plant-placed-button"
                    style={{ left: `${cell.xPct}%`, top: `${cell.yPct}%` }}
                    disabled={cellRequiresControlLease(cell) && !youHold}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      void pressCell(cell);
                    }}
                    onPointerUp={() => releaseCell(cell)}
                    onPointerCancel={() => releaseCell(cell)}
                    aria-label={cell.label}
                  >
                    {cell.label}
                  </Button>
                ))}
              </div>
            </div>
          </HelpTip>

          <Card className="operator-matrix-card">
            <CardContent className="operator-matrix-toolbar-wrap min-h-0 px-1.5 py-1">
              <div className="operator-matrix-toolbar">
                <HelpTip id="tour.operator.safePin">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                    <Label
                      htmlFor="safe-pin"
                      className="shrink-0 whitespace-nowrap text-[10px]"
                    >
                      {t('safePin')}
                    </Label>
                    <Input
                      id="safe-pin"
                      className="h-6 min-h-6 w-[5.5rem] max-w-[7rem] shrink-0 px-1.5 text-[10px]"
                      value={safePin}
                      onChange={(e) => setSafePin(e.target.value)}
                      type="password"
                      placeholder={t('safePin')}
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 min-h-6 shrink-0 px-1.5 text-[10px]"
                      onClick={() => void resetEStop()}
                    >
                      {t('resetEstop')}
                    </Button>
                  </div>
                </HelpTip>
                {showJogSpeed ? (
                  <div
                    className="flex shrink-0 flex-wrap items-center gap-1"
                    role="group"
                    aria-label={t('jogSpeed')}
                  >
                    <span className="text-[10px] text-muted-foreground">
                      {t('jogSpeed')}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant={jogSpeed === 'slow' ? 'default' : 'outline'}
                      className="h-6 min-h-6 px-1.5 text-[10px]"
                      aria-pressed={jogSpeed === 'slow'}
                      onClick={() => setJogSpeed('slow')}
                    >
                      {t('jogSlow')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={jogSpeed === 'fast' ? 'default' : 'outline'}
                      className="h-6 min-h-6 px-1.5 text-[10px]"
                      aria-pressed={jogSpeed === 'fast'}
                      onClick={() => setJogSpeed('fast')}
                    >
                      {t('jogFast')}
                    </Button>
                  </div>
                ) : null}
              </div>
              <HelpTip id="tour.operator.matrix" className="matrix-board">
                <div
                  className="matrix-grid"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(grid.cols, 1)}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${Math.max(grid.rows, 1)}, minmax(2.75rem, auto))`,
                  }}
                >
                  {grid.cells.map((cell, idx) => {
                    if (!cell) {
                      return (
                        <div
                          key={`empty-${idx}`}
                          className="matrix-grid-hole"
                          aria-hidden
                        />
                      );
                    }
                    // FEAT-A3: STOP lives in the fixed dock, not the scrolling matrix.
                    if (
                      stopCell &&
                      (cell.id === stopCell.id || cell.style === 'estop')
                    ) {
                      return (
                        <div
                          key={`stop-slot-${cell.id}`}
                          className="matrix-grid-hole"
                          aria-hidden
                        />
                      );
                    }
                    return renderMatrixCell(cell);
                  })}
                </div>
              </HelpTip>
              <HelpTip id="tour.operator.holdHint">
                <p className="truncate px-0.5 text-[9px] leading-none text-muted-foreground">
                  {t('holdHint')}
                </p>
              </HelpTip>
            </CardContent>
          </Card>
        </div>
      </div>
      {stopCell ? (
        <div className="matrix-stop-dock" data-feat="a3-stop-dock">
          {renderMatrixCell(stopCell)}
        </div>
      ) : null}
    </div>
  );
}
