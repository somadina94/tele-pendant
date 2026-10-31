import type { LiveTags } from './api';

export function formatOverlay(
  format: string,
  value: string | number | boolean,
) {
  return format.replace('{value}', String(value));
}

export function tagValueForRegister(
  tags: LiveTags | null,
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
