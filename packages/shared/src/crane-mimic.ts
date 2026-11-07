import type { TagSnapshot } from './tags';

/** Demo crane travel envelope (matches modbus-sim clamps). */
export const CRANE_MIMIC_TRAVEL_MM = 5000;
/** Soft load scale for the mimic bar (not a certified load limit). */
export const CRANE_MIMIC_LOAD_KG = 2000;

export type CraneMimicSafetyLike = {
  mode?: string | null;
  eStopActive?: boolean;
  watchdogOk?: boolean;
  deadmanActive?: boolean;
};

export type CraneMimicView = {
  /** 0..1 left → right along the bridge. */
  trolleyPct: number;
  /** 0..1 raised amount (demo height mm / travel). Render hook higher as this grows. */
  hoistPct: number;
  /** 0..1 load bar fill. */
  loadPct: number;
  hoistHeightMm: number | null;
  trolleyPositionMm: number | null;
  loadKg: number | null;
  motorRunning: boolean;
  fault: boolean;
  safetyTone: 'ok' | 'warn' | 'danger';
  motorTone: 'idle' | 'run' | 'fault';
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * FEAT-HMI phase 1: map live tags + safety into a crane mimic pose.
 * Demo hoist-up increases height mm — render the hook higher as hoistPct grows.
 */
export function resolveCraneMimicView(input: {
  tags: TagSnapshot | null | undefined;
  safety?: CraneMimicSafetyLike | null;
  travelMm?: number;
  loadKgMax?: number;
}): CraneMimicView {
  const travel = input.travelMm ?? CRANE_MIMIC_TRAVEL_MM;
  const loadMax = input.loadKgMax ?? CRANE_MIMIC_LOAD_KG;
  const tags = input.tags;
  const hoistHeightMm = numOrNull(tags?.hoistHeightMm);
  const trolleyPositionMm = numOrNull(
    tags?.trolleyPositionMm ??
      (typeof tags?.values?.['holding.trolleyPosition'] === 'number'
        ? tags.values['holding.trolleyPosition']
        : null),
  );
  const loadKg = numOrNull(tags?.loadKg);
  const motorRunning = Boolean(tags?.motorRunning);
  const fault = Boolean(tags?.fault);

  const mode = (input.safety?.mode ?? '').toLowerCase();
  const eStop = Boolean(input.safety?.eStopActive);
  const watchdogBad = input.safety?.watchdogOk === false;
  let safetyTone: CraneMimicView['safetyTone'] = 'ok';
  if (eStop || mode === 'e_stop' || mode === 'safe_state') {
    safetyTone = 'danger';
  } else if (
    watchdogBad ||
    mode === 'comms_lost' ||
    (mode && mode !== 'normal' && mode !== 'unknown')
  ) {
    safetyTone = 'warn';
  }

  let motorTone: CraneMimicView['motorTone'] = 'idle';
  if (fault || safetyTone === 'danger') motorTone = 'fault';
  else if (motorRunning) motorTone = 'run';

  return {
    trolleyPct: clamp01((trolleyPositionMm ?? 0) / travel),
    hoistPct: clamp01((hoistHeightMm ?? 0) / travel),
    loadPct: clamp01((loadKg ?? 0) / loadMax),
    hoistHeightMm,
    trolleyPositionMm,
    loadKg,
    motorRunning,
    fault,
    safetyTone,
    motorTone,
  };
}
