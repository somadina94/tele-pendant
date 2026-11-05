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
  LOCALES,
  translate,
  translateError,
} from './i18n';
export type { Locale } from './i18n';
export {
  formatOverlay,
  isClusterMetricRegister,
  tagValueForRegister,
} from './tags';
export type { TagSnapshot } from './tags';
export { tourStepsFor } from './tour';
export type { TourScreen } from './tour';
export { ASSISTANT_SUGGESTION_GROUPS } from './assistant-suggestions';
export type { SuggestionGroup } from './assistant-suggestions';
export {
  OPERATOR_ROUTES,
  SUPERVISOR_ROUTES,
  canAccessAppRoute,
  canEditAssistantSettings,
  canManageScanCodes,
  canManageUsers,
  canShelveAlarms,
  configSectionIdsForRole,
  isUserRole,
} from './roles';
export type { AppRoute, OperatorRoute, SupervisorRoute } from './roles';

export const WS_EVENTS = {
  TAGS_UPDATE: 'tags.update',
  SAFETY_STATE: 'safety.state',
  ALARM: 'alarm.event',
  CONNECTION_HEALTH: 'connection.health',
} as const;
