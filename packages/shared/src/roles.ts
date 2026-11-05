type UserRole = 'operator' | 'supervisor' | 'admin';

/** Routes/screens every signed-in role may use. */
export const OPERATOR_ROUTES = [
  'operator',
  'media',
  'assistant',
  'face',
  'ops',
] as const;

/** Supervisor and admin only. */
export const SUPERVISOR_ROUTES = ['config', 'audit'] as const;

export type OperatorRoute = (typeof OPERATOR_ROUTES)[number];
export type SupervisorRoute = (typeof SUPERVISOR_ROUTES)[number];
export type AppRoute = OperatorRoute | SupervisorRoute;

export function isUserRole(value: string | undefined | null): value is UserRole {
  return value === 'operator' || value === 'supervisor' || value === 'admin';
}

export function canAccessAppRoute(role: UserRole, route: AppRoute): boolean {
  if ((OPERATOR_ROUTES as readonly string[]).includes(route)) return true;
  if (route === 'config' || route === 'audit') {
    return role === 'supervisor' || role === 'admin';
  }
  return false;
}

export function canShelveAlarms(role: UserRole): boolean {
  return role === 'supervisor' || role === 'admin';
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'admin';
}

export function canEditAssistantSettings(role: UserRole): boolean {
  return role === 'admin';
}

export function canManageScanCodes(role: UserRole): boolean {
  return role === 'supervisor' || role === 'admin';
}

export function configSectionIdsForRole(role: UserRole): string[] {
  const base = [
    'plc',
    'registers',
    'cells',
    'labels',
    'background',
    ...(canManageScanCodes(role) ? (['codes'] as const) : []),
    'alarms',
    'safety',
  ];
  if (role === 'admin') return ['users', ...base];
  return base;
}
