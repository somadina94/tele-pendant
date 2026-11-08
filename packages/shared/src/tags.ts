export interface TagSnapshot {
  hoistHeightMm: number;
  loadKg: number;
  speedPct: number;
  /** Demo / plant trolley travel (holding.trolleyPosition). */
  trolleyPositionMm?: number;
  motorRunning: boolean;
  /** Plant fault discrete when present (FEAT-A1). */
  fault?: boolean;
  commsOk?: boolean;
  values?: Record<string, number | boolean>;
  /** Monotonic poll sequence — prefer over `at` when merging WS + HTTP. */
  seq?: number;
  at?: string;
}

export function formatOverlay(
  format: string,
  value: string | number | boolean,
): string {
  return format.replace('{value}', String(value));
}

/** Registers already shown in the Operator cluster readout. */
export function isClusterMetricRegister(registerName?: string | null): boolean {
  if (!registerName) return false;
  return (
    registerName.includes('hoistHeight') ||
    registerName.includes('loadKg') ||
    registerName.includes('trolleyPosition') ||
    registerName.includes('motorRunning')
  );
}

export function shouldApplyLiveTags(
  lastSeq: number,
  lastAt: string | null | undefined,
  incoming: Pick<TagSnapshot, 'seq' | 'at'>,
): boolean {
  if (incoming.seq != null) {
    return incoming.seq > lastSeq;
  }
  if (!incoming.at) return true;
  if (!lastAt) return true;
  return incoming.at > lastAt;
}

export function nextLiveTagsCursor(
  prev: { lastSeq: number; lastAt: string | null },
  incoming: Pick<TagSnapshot, 'seq' | 'at'>,
): { lastSeq: number; lastAt: string | null } {
  return {
    lastSeq:
      incoming.seq != null
        ? Math.max(prev.lastSeq, incoming.seq)
        : prev.lastSeq,
    lastAt:
      incoming.at != null && (prev.lastAt == null || incoming.at >= prev.lastAt)
        ? incoming.at
        : prev.lastAt,
  };
}

export function tagValueForRegister(
  tags: TagSnapshot | null,
  registerName?: string | null,
): string | number | boolean {
  if (!tags || !registerName) return '—';
  const live = tags.values?.[registerName];
  if (live !== undefined) {
    if (typeof live === 'boolean' && registerName.includes('motorRunning')) {
      return live ? 'RUN' : 'IDLE';
    }
    return live;
  }
  if (registerName.includes('hoistHeight')) return tags.hoistHeightMm;
  if (registerName.includes('loadKg')) return tags.loadKg;
  if (registerName.includes('trolleyPosition')) {
    return tags.trolleyPositionMm ?? '—';
  }
  if (registerName.includes('motorRunning'))
    return tags.motorRunning ? 'RUN' : 'IDLE';
  if (registerName.includes('speed')) return tags.speedPct;
  return '—';
}
