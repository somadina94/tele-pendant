import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ACCESS_TOKEN_COOKIE } from '../../common/constants';
import { AuthService, JwtPayload } from './auth.service';

/** Cookie first, then Authorization Bearer — shared with unit tests. */
export function extractAccessToken(req: Request): string | null {
  const cookieToken = req?.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;
  if (cookieToken) {
    return cookieToken;
  }
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly authService: AuthService;

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(AuthService) authService: AuthService,
  ) {
    const secret = configService.get<string>('appConfig.jwt.secret');
    if (!secret) {
      throw new Error('JWT secret is not configured');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractAccessToken]),
      ignoreExpiration: false,
      secretOrKey: secret,
      audience: configService.get<string>('appConfig.jwt.audience'),
      issuer: configService.get<string>('appConfig.jwt.issuer'),
    });
    this.authService = authService;
  }

  /**
   * TP-40: payload-only trust is insufficient — re-check DB for suspend/delete/revoke.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    try {
      return await this.authService.assertActiveSession(payload);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Unauthorized');
    }
  }
}
