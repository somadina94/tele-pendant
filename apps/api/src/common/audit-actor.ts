import { JwtPayload } from '../auth/providers/auth.service';

export type AuditActor = {
  userId?: string;
  userEmail?: string;
  userDisplayName?: string | null;
  ip?: string;
};

export function auditActorFromRequest(
  user: JwtPayload,
  ip?: string,
): AuditActor {
  return {
    userId: user.sub,
    userEmail: user.email,
    userDisplayName: user.displayName ?? null,
    ip,
  };
}

export function auditWriteFields(actor?: AuditActor) {
  return {
    userId: actor?.userId,
    userEmail: actor?.userEmail,
    userDisplayName: actor?.userDisplayName ?? null,
    ip: actor?.ip,
  };
}
