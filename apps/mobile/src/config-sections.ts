import {
  configSectionIdsForRole,
  type UserRole,
} from '@tele-pendant/shared';

export type MobileConfigSection =
  | 'users'
  | 'plc'
  | 'registers'
  | 'cells'
  | 'labels'
  | 'background'
  | 'codes'
  | 'alarms'
  | 'safety';

const SECTION_LABELS: Record<MobileConfigSection, string> = {
  users: 'Users',
  plc: 'PLC connections',
  registers: 'Register maps',
  cells: 'Matrix cells',
  labels: 'Live labels',
  background: 'Background',
  codes: 'QR / scan codes',
  alarms: 'Alarm definitions',
  safety: 'Safety roles',
};

export const MOBILE_CONFIG_SECTIONS: Array<{
  value: MobileConfigSection;
  label: string;
}> = (
  [
    'users',
    'plc',
    'registers',
    'cells',
    'labels',
    'background',
    'codes',
    'alarms',
    'safety',
  ] as MobileConfigSection[]
).map((value) => ({ value, label: SECTION_LABELS[value] }));

export function mobileConfigSectionsForRole(
  role: UserRole | null,
): Array<{ value: MobileConfigSection; label: string }> {
  if (!role) {
    return MOBILE_CONFIG_SECTIONS.filter((s) => s.value !== 'users');
  }
  const allowed = new Set(configSectionIdsForRole(role));
  return MOBILE_CONFIG_SECTIONS.filter((s) => allowed.has(s.value));
}
