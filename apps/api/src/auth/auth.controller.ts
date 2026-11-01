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
import type { Request, Response } from 'express';
import { ACCESS_TOKEN_COOKIE } from '../common/constants';
import { ApiAuth } from '../common/swagger/api-auth.decorator';
import { FaceImageDto, FaceLoginDto } from './dtos/face-image.dto';
import { LoginDto } from './dtos/login.dto';
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

  /**
   * Enroll basic face template (convenience auth — not biometrics).
   */
  @Post('face/enroll')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Enroll face template (basic / convenience only)',
  })
  enrollFace(
    @Body() dto: FaceImageDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.authService.enrollFace(req.user.sub, dto.imageDataUrl, req.ip);
  }

  /**
   * Face login — fails closed to password when match is weak.
   */
  @Post('face/login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Face login (basic match; prefer password if unsure)',
  })
  async faceLogin(
    @Body() dto: FaceLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithFace(
      dto.imageDataUrl,
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
