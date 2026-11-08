import {
  Inject,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ACCESS_TOKEN_COOKIE } from '../common/constants';
import { ApiAuth } from '../common/swagger/api-auth.decorator';
import { SkipDataWrap } from '../common/swagger/skip-data-wrap.decorator';
import { FaceImageDto, FaceLoginDto } from './dtos/face-image.dto';
import { LoginDto } from './dtos/login.dto';
import { OAuthTokenDto } from './dtos/oauth-token.dto';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { ChangeSafeActionPinDto } from './dtos/change-safe-action-pin.dto';
import { UpdateLocaleDto } from './dtos/update-locale.dto';
import { ConfirmTwoFactorDto } from './dtos/confirm-two-factor.dto';
import { ResendOtpDto, VerifyOtpDto } from './dtos/verify-otp.dto';
import {
  AuthService,
  JwtPayload,
  type LoginOtpChallenge,
  type LoginSuccess,
} from './providers/auth.service';
import { JwtAuthGuard } from './providers/jwt-auth.guard';

/**
 * Authentication endpoints (login, logout, session, optional email OTP 2FA).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  private setSessionCookie(res: Response, accessToken: string) {
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      accessToken,
      this.authService.getCookieOptions(),
    );
  }

  private isOtpChallenge(
    result: LoginSuccess | LoginOtpChallenge,
  ): result is LoginOtpChallenge {
    return 'requiresTwoFactor' in result && result.requiresTwoFactor === true;
  }

  /**
   * Validate credentials and set httpOnly JWT cookie. Also returns Bearer token.
   * When the user has email 2FA on, returns a challenge instead of a token.
   */
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Login (sets access_token cookie + Bearer, or email OTP challenge when 2FA on)',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, req.ip);
    if (!this.isOtpChallenge(result)) {
      this.setSessionCookie(res, result.accessToken);
    }
    return result;
  }

  @Post('login/otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Complete login with email OTP (when 2FA on)' })
  async verifyLoginOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyLoginOtp(
      dto.challengeId,
      dto.code,
      req.ip,
    );
    this.setSessionCookie(res, result.accessToken);
    return result;
  }

  @Post('login/otp/resend')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resend login email OTP' })
  resendLoginOtp(@Body() dto: ResendOtpDto, @Req() req: Request) {
    return this.authService.resendLoginOtp(dto.challengeId, req.ip);
  }

  /**
   * OAuth2 password-grant token for Swagger Authorize (username = email).
   * Returns a raw `{ access_token, token_type }` body (not the usual API envelope).
   * Refuses when the account has email 2FA enabled.
   */
  @Post('token')
  @HttpCode(200)
  @SkipDataWrap()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'OAuth2 password token (Swagger Authorize)',
    description:
      'Form or JSON: username (email) + password. Used by Swagger UI oauth2 password flow. Not available when email 2FA is on.',
  })
  async token(@Body() dto: OAuthTokenDto, @Req() req: Request) {
    const result = await this.authService.loginPasswordGrant(
      { email: dto.username, password: dto.password },
      req.ip,
    );
    return {
      access_token: result.accessToken,
      token_type: 'bearer',
    };
  }

  /**
   * Clear session cookie and revoke outstanding JWTs when a token is present (TP-40).
   */
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Logout (clears access_token cookie and revokes Bearer sessions)',
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const header = req.headers.authorization;
    const bearer =
      typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
        ? header.slice(7).trim()
        : undefined;
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      ACCESS_TOKEN_COOKIE
    ];
    await this.authService.revokeSessionsFromToken(bearer || cookieToken);
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    return { ok: true };
  }

  /**
   * Current authenticated user.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @ApiOperation({ summary: 'Current session user' })
  me(@Req() req: Request & { user: JwtPayload }) {
    return this.authService.me(req.user);
  }

  @Patch('locale')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @ApiOperation({ summary: 'Pin the signed-in user language' })
  updateLocale(
    @Body() body: UpdateLocaleDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.authService.updateLocale(req.user.sub, body.locale);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Change password (signed-in user)' })
  changePassword(
    @Body() body: ChangePasswordDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.authService.changePassword(
      req.user.sub,
      body.currentPassword,
      body.newPassword,
      req.ip,
    );
  }

  @Patch('safe-action-pin')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Set or change personal reset PIN (operator, supervisor, admin)',
  })
  changeSafeActionPin(
    @Body() body: ChangeSafeActionPinDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.authService.changeSafeActionPin(
      req.user.sub,
      body.currentPin,
      body.newPin,
      req.ip,
    );
  }

  @Post('two-factor/enable')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Start enabling email 2FA (sends OTP to the signed-in user)',
  })
  beginEnableTwoFactor(@Req() req: Request & { user: JwtPayload }) {
    return this.authService.beginEnableTwoFactor(req.user.sub, req.ip);
  }

  @Post('two-factor/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirm email 2FA enable with OTP' })
  confirmEnableTwoFactor(
    @Body() body: ConfirmTwoFactorDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.authService.confirmEnableTwoFactor(
      req.user.sub,
      body.challengeId,
      body.code,
      req.ip,
    );
  }

  @Post('two-factor/disable')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Disable email 2FA for the signed-in user' })
  disableTwoFactor(@Req() req: Request & { user: JwtPayload }) {
    return this.authService.disableTwoFactor(req.user.sub, req.ip);
  }

  /**
   * Enroll local face template (challenge frames required — TP-45). Not ISO-certified.
   */
  @Post('face/enroll')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Enroll face template (requires frames[3] challenge; not ISO-certified)',
  })
  enrollFace(
    @Body() dto: FaceImageDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.authService.enrollFace(
      req.user.sub,
      { frames: dto.frames },
      req.ip,
    );
  }

  /**
   * Face login — fails closed to password when match is weak.
   * When the matched user has email 2FA on, returns an OTP challenge instead of a token.
   */
  @Post('face/login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Face login with frames[3] challenge liveness (prefer password if unsure)',
  })
  async faceLogin(
    @Body() dto: FaceLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithFace(
      { frames: dto.frames },
      dto.email,
      req.ip,
    );
    if (!this.isOtpChallenge(result)) {
      this.setSessionCookie(res, result.accessToken);
    }
    return result;
  }
}
