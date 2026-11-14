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
  nextLiveTagsCursor,
  shouldApplyLiveTags,
  tagValueForRegister,
} from './tags';
export { isOperatorScreenReady, operatorNeedsLiveTags } from './operator-ready';
export type { OperatorLayoutLike } from './operator-ready';
export type { TagSnapshot } from './tags';
export {
  CRANE_MIMIC_LOAD_KG,
  CRANE_MIMIC_TRAVEL_MM,
  resolveCraneMimicView,
} from './crane-mimic';
export type { CraneMimicSafetyLike, CraneMimicView } from './crane-mimic';
export {
  MATRIX_CELL_STATE_CODE,
  MATRIX_CELL_STATE_I18N,
  resolveMatrixCellUiState,
} from './matrix-cell-state';
export type {
  MatrixCellSafetyLike,
  MatrixCellStateInput,
  MatrixCellTagsLike,
  MatrixCellUiState,
} from './matrix-cell-state';
export {
  cellPulsesDeadman,
  cellRequiresControlLease,
  cellUsesHoldToRun,
  isOperatorStopCell,
  parseSelectorSideLabels,
} from './selector-rocker';
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
export {
  ALARM_SEVERITIES,
  DEFAULT_ALARM_SEVERITY,
  alarmSeveritySelectOptions,
  normalizeAlarmSeverity,
  tryParseAlarmSeverity,
} from './alarm-severity';
export type { AlarmSeverity, AlarmSeverityParseResult } from './alarm-severity';

export const WS_EVENTS = {
  TAGS_UPDATE: 'tags.update',
  SAFETY_STATE: 'safety.state',
  ALARM: 'alarm.event',
  CONNECTION_HEALTH: 'connection.health',
} as const;
