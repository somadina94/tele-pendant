export interface TagSnapshot {
  hoistHeightMm: number;
  loadKg: number;
  speedPct: number;
  motorRunning: boolean;
  values?: Record<string, number | boolean>;
}

export function formatOverlay(
  format: string,
  value: string | number | boolean,
): string {
  return format.replace('{value}', String(value));
}

/** Registers already shown in the Operator cluster readout. */
export function isClusterMetricRegister(
  registerName?: string | null,
): boolean {
  if (!registerName) return false;
  return (
    registerName.includes('hoistHeight') ||
    registerName.includes('loadKg') ||
    registerName.includes('motorRunning')
  );
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
  if (registerName.includes('motorRunning'))
    return tags.motorRunning ? 'RUN' : 'IDLE';
  if (registerName.includes('speed')) return tags.speedPct;
  return '—';
}
