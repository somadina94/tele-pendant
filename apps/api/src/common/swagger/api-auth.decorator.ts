import { applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiBearerAuth } from '@nestjs/swagger';

/**
 * Marks an endpoint as requiring JWT (cookie or Bearer).
 */
export function ApiAuth() {
  return applyDecorators(ApiCookieAuth('access_token'), ApiBearerAuth());
}
