import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ACCESS_TOKEN_COOKIE } from '../../common/constants';
import { JwtPayload } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(ConfigService) configService: ConfigService) {
    const secret = configService.get<string>('appConfig.jwt.secret');
    if (!secret) {
      throw new Error('JWT secret is not configured');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null => {
          const cookieToken = req?.cookies?.[ACCESS_TOKEN_COOKIE] as
            string | undefined;
          if (cookieToken) {
            return cookieToken;
          }
          return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
      audience: configService.get<string>('appConfig.jwt.audience'),
      issuer: configService.get<string>('appConfig.jwt.issuer'),
    });
  }

  validate(payload: JwtPayload) {
    return payload;
  }
}
