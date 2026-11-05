import type { ReactNode } from 'react';
import type { UserRole } from '@tele-pendant/shared';
import { getStoredUserRole } from '@/lib/user-session';
import { AccessDeniedPage } from '@/components/access-denied';

export function RequireRole({
  allow,
  children,
  detail,
}: {
  allow: UserRole[];
  children: ReactNode;
  detail?: string;
}) {
  const role = getStoredUserRole();
  if (!role || !allow.includes(role)) {
    return <AccessDeniedPage detail={detail} />;
  }
  return children;
}
