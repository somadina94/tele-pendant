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

export const WS_EVENTS = {
  TAGS_UPDATE: 'tags.update',
  SAFETY_STATE: 'safety.state',
  ALARM: 'alarm.event',
  CONNECTION_HEALTH: 'connection.health',
} as const;
