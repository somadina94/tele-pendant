/**
 * Operator matrix button visual/logical states (FEAT-A1).
 * Priority: fault > blocked > running > idle.
 */

export type MatrixCellUiState = 'idle' | 'running' | 'blocked' | 'fault';

export type MatrixCellSafetyLike = {
  mode?: string | null;
  eStopActive?: boolean;
  watchdogOk?: boolean;
};

export type MatrixCellTagsLike = {
  fault?: boolean;
  motorRunning?: boolean;
  values?: Record<string, number | boolean>;
};

export type MatrixCellStateInput = {
  style: string;
  isMotion: boolean;
  isHolding: boolean;
  safety: MatrixCellSafetyLike | null | undefined;
  tags: MatrixCellTagsLike | null | undefined;
  /** Optional status register name (e.g. discrete.motorRunning / discrete.fault). */
  statusRegisterName?: string | null;
};

/** Short colour-blind labels (pair with colour tokens in UI). */
export const MATRIX_CELL_STATE_CODE: Record<MatrixCellUiState, string> = {
  idle: 'IDLE',
  running: 'RUN',
  blocked: 'BLOCK',
  fault: 'FAULT',
};

/** i18n key for each state chip. */
export const MATRIX_CELL_STATE_I18N: Record<MatrixCellUiState, string> = {
  idle: 'cellStateIdle',
  running: 'cellStateRunning',
  blocked: 'cellStateBlocked',
  fault: 'cellStateFault',
};

function statusToken(
  tags: MatrixCellTagsLike | null | undefined,
  statusRegisterName?: string | null,
): string | number | boolean | undefined {
  if (!tags || !statusRegisterName) return undefined;
  const live = tags.values?.[statusRegisterName];
  if (live !== undefined) return live;
  if (statusRegisterName.includes('motorRunning')) return tags.motorRunning;
  if (statusRegisterName.includes('fault')) return tags.fault;
  return undefined;
}

function looksFault(
  tags: MatrixCellTagsLike | null | undefined,
  statusRegisterName?: string | null,
): boolean {
  if (tags?.fault === true) return true;
  const raw = statusToken(tags, statusRegisterName);
  if (raw === undefined) return false;
  if (typeof raw === 'boolean') {
    return Boolean(statusRegisterName?.includes('fault') && raw);
  }
  const text = String(raw).trim().toUpperCase();
  return (
    text === 'FAULT' ||
    text === 'FAULTING' ||
    text === 'ERR' ||
    text === 'ERROR' ||
    text === 'FAIL'
  );
}

function looksRunning(
  tags: MatrixCellTagsLike | null | undefined,
  statusRegisterName?: string | null,
): boolean {
  const raw = statusToken(tags, statusRegisterName);
  if (raw === undefined) return false;
  if (typeof raw === 'boolean') {
    return Boolean(statusRegisterName?.includes('motorRunning') && raw);
  }
  const text = String(raw).trim().toUpperCase();
  return text === 'RUN' || text === 'RUNNING' || text === 'ON' || text === '1';
}

function isSafetyBlocking(
  safety: MatrixCellSafetyLike | null | undefined,
): boolean {
  if (!safety) return false;
  if (safety.eStopActive) return true;
  if (safety.watchdogOk === false) return true;
  const mode = (safety.mode ?? '').toLowerCase();
  return (
    mode === 'e_stop' ||
    mode === 'estop' ||
    mode === 'comms_lost' ||
    mode === 'safe_state'
  );
}

/**
 * Resolve matrix cell UI state from hold + safety + tags.
 * E-stop cells stay interactive red in CSS; state still drives the chip/ARIA.
 */
export function resolveMatrixCellUiState(
  input: MatrixCellStateInput,
): MatrixCellUiState {
  const { style, isMotion, isHolding, safety, tags, statusRegisterName } =
    input;
  const isEstop = style === 'estop';

  if (looksFault(tags, statusRegisterName)) {
    return 'fault';
  }

  if (isEstop) {
    // Latched STOP is blocked/STOP — never RUN (operators read the chip).
    if (
      safety?.eStopActive ||
      (safety?.mode ?? '').toLowerCase() === 'e_stop' ||
      isSafetyBlocking(safety)
    ) {
      return 'blocked';
    }
    return 'idle';
  }

  if (isMotion && isSafetyBlocking(safety)) {
    return 'blocked';
  }

  if (isHolding || (isMotion && looksRunning(tags, statusRegisterName))) {
    return 'running';
  }

  return 'idle';
}
