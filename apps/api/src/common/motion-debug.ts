import { Logger } from '@nestjs/common';

const logger = new Logger('MotionDebug');

/**
 * Opt-in via MOTION_DEBUG=1. Production compose defaults to off;
 * docker-compose.dev.yml sets MOTION_DEBUG=1 for local diagnose.
 */
export function motionDebugEnabled(): boolean {
  const raw = (process.env.MOTION_DEBUG ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function motionDebug(
  event: string,
  details?: Record<string, unknown>,
): void {
  if (!motionDebugEnabled()) return;
  if (details && Object.keys(details).length > 0) {
    logger.log(`[motion] ${event} ${JSON.stringify(details)}`);
    return;
  }
  logger.log(`[motion] ${event}`);
}
