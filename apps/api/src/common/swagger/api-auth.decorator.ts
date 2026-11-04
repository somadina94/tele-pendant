import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOAuth2 } from '@nestjs/swagger';

/**
 * Marks an endpoint as requiring JWT (cookie, Bearer, or Swagger OAuth2 login).
 */
export function ApiAuth() {
  return applyDecorators(
    ApiCookieAuth('access_token'),
    ApiBearerAuth(),
    ApiOAuth2([], 'oauth2'),
  );
}
