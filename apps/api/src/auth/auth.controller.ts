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
import { AuthService, JwtPayload } from './providers/auth.service';
import { JwtAuthGuard } from './providers/jwt-auth.guard';

/**
 * Authentication endpoints (login, logout, session).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  /**
   * Validate credentials and set httpOnly JWT cookie. Also returns Bearer token.
   */
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Login (sets access_token cookie + returns Bearer)',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, req.ip);
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      result.accessToken,
      this.authService.getCookieOptions(),
    );
    return result;
  }

  /**
   * OAuth2 password-grant token for Swagger Authorize (username = email).
   * Returns a raw `{ access_token, token_type }` body (not the usual API envelope).
   */
  @Post('token')
  @HttpCode(200)
  @SkipDataWrap()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'OAuth2 password token (Swagger Authorize)',
    description:
      'Form or JSON: username (email) + password. Used by Swagger UI oauth2 password flow.',
  })
  async token(@Body() dto: OAuthTokenDto, @Req() req: Request) {
    const result = await this.authService.login(
      { email: dto.username, password: dto.password },
      req.ip,
    );
    return {
      access_token: result.accessToken,
      token_type: 'bearer',
    };
  }

  /**
   * Clear session cookie.
   */
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout (clears access_token cookie)' })
  logout(@Res({ passthrough: true }) res: Response) {
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
    summary:
      'Set or change personal reset PIN (operator, supervisor, admin)',
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

  /**
   * Enroll local face template (challenge frames preferred). Not ISO-certified.
   */
  @Post('face/enroll')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Enroll face template (local challenge liveness; not ISO-certified)',
  })
  enrollFace(
    @Body() dto: FaceImageDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.authService.enrollFace(
      req.user.sub,
      { imageDataUrl: dto.imageDataUrl, frames: dto.frames },
      req.ip,
    );
  }

  /**
   * Face login — fails closed to password when match is weak.
   */
  @Post('face/login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Face login with optional challenge frames (prefer password if unsure)',
  })
  async faceLogin(
    @Body() dto: FaceLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithFace(
      { imageDataUrl: dto.imageDataUrl, frames: dto.frames },
      dto.email,
      req.ip,
    );
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      result.accessToken,
      this.authService.getCookieOptions(),
    );
    return result;
  }
}
