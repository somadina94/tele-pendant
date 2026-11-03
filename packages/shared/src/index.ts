export type UserRole = 'operator' | 'supervisor' | 'admin';

export type RegisterType = 'coil' | 'discrete' | 'holding' | 'input';

export interface ApiEnvelope<T> {
  apiVersion: string;
  data: T;
}

export interface HealthPayload {
  status: string;
  service: string;
  timestamp: string;
}

export {
  normalizeLocale,
  resolveLocale,
  translate,
  translateError,
} from './i18n';
export type { Locale } from './i18n';
export { formatOverlay, tagValueForRegister } from './tags';
export type { TagSnapshot } from './tags';
export { tourStepsFor } from './tour';
export type { TourScreen } from './tour';
export { ASSISTANT_SUGGESTION_GROUPS } from './assistant-suggestions';
export type { SuggestionGroup } from './assistant-suggestions';

export const WS_EVENTS = {
  TAGS_UPDATE: 'tags.update',
  SAFETY_STATE: 'safety.state',
  ALARM: 'alarm.event',
  CONNECTION_HEALTH: 'connection.health',
} as const;
