import { describe, expect, it } from 'vitest';
import {
  canAccessAppRoute,
  canEditAssistantSettings,
  canManageScanCodes,
  canManageUsers,
  canShelveAlarms,
  configSectionIdsForRole,
} from './roles';

describe('roles', () => {
  it('gates config and audit to supervisor and admin', () => {
    expect(canAccessAppRoute('operator', 'ops')).toBe(true);
    expect(canAccessAppRoute('operator', 'config')).toBe(false);
    expect(canAccessAppRoute('operator', 'audit')).toBe(false);
    expect(canAccessAppRoute('supervisor', 'config')).toBe(true);
    expect(canAccessAppRoute('admin', 'audit')).toBe(true);
  });

  it('gates alarm shelve and user admin actions', () => {
    expect(canShelveAlarms('operator')).toBe(false);
    expect(canShelveAlarms('supervisor')).toBe(true);
    expect(canManageUsers('supervisor')).toBe(false);
    expect(canManageUsers('admin')).toBe(true);
    expect(canEditAssistantSettings('admin')).toBe(true);
    expect(canEditAssistantSettings('operator')).toBe(false);
  });

  it('lists config sections by role', () => {
    expect(configSectionIdsForRole('operator')).not.toContain('users');
    expect(configSectionIdsForRole('operator')).not.toContain('codes');
    expect(canManageScanCodes('supervisor')).toBe(true);
    expect(configSectionIdsForRole('supervisor')).toContain('codes');
    expect(configSectionIdsForRole('admin')[0]).toBe('users');
  });
});
