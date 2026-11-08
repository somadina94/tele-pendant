import {
  Inject,
  Injectable,
  OnModuleInit,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import type { CookieOptions } from 'express';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/providers/audit.service';
import { UserRole } from '../../users/enums/user-role.enum';
import { User } from '../../users/entities/user.entity';
import { SafeActionPinService } from '../../users/providers/safe-action-pin.service';
import { LoginDto } from '../dtos/login.dto';
import {
  descriptorFromChallengeFrames,
  FACE_MATCH_THRESHOLD,
  matchScore,
  openTemplate,
  sealTemplate,
  serializeDescriptor,
} from './face.util';
import { MailService } from './mail.service';
import { OtpChallengeService } from './otp-challenge.service';

export type FaceCaptureInput = {
  imageDataUrl?: string;
  frames?: string[];
};

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  displayName?: string | null;
  /** Matches `User.tokenVersion`; mismatch means session was revoked. */
  tv?: number;
}

export type LoginSuccess = {
  accessToken: string;
  user: ReturnType<AuthService['toPublicUser']>;
  matchScore?: number;
  limitation?: string;
};

export type LoginOtpChallenge = {
  requiresTwoFactor: true;
  challengeId: string;
  emailHint: string;
};

/**
 * Authentication: bootstrap admin, password login, JWT cookie/bearer.
 * Optional per-user email OTP 2FA (STOP/motion never wait on OTP).
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly usersRepository: Repository<User>;
  private readonly jwtService: JwtService;
  private readonly configService: ConfigService;
  private readonly auditService: AuditService;
  private readonly safeActionPin: SafeActionPinService;
  private readonly mailService: MailService;
  private readonly otpChallenges: OtpChallengeService;

  constructor(
    @InjectRepository(User)
    usersRepository: Repository<User>,
    @Inject(JwtService) jwtService: JwtService,
    @Inject(ConfigService) configService: ConfigService,
    @Inject(AuditService) auditService: AuditService,
    @Inject(SafeActionPinService) safeActionPin: SafeActionPinService,
    @Inject(MailService) mailService: MailService,
    @Inject(OtpChallengeService) otpChallenges: OtpChallengeService,
  ) {
    this.usersRepository = usersRepository;
    this.jwtService = jwtService;
    this.configService = configService;
    this.auditService = auditService;
    this.safeActionPin = safeActionPin;
    this.mailService = mailService;
    this.otpChallenges = otpChallenges;
  }

  async onModuleInit(): Promise<void> {
    const email = this.configService.get<string>('appConfig.admin.email');
    const password = this.configService.get<string>('appConfig.admin.password');
    if (!email || !password) return;

    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(password, 12);
    const plantPin = this.safeActionPin.plantPinFallback();
    const safeActionPinHash = plantPin ? await bcrypt.hash(plantPin, 12) : null;
    await this.usersRepository.save(
      this.usersRepository.create({
        email,
        passwordHash,
        role: UserRole.ADMIN,
        displayName: 'Administrator',
        safeActionPinHash,
      }),
    );
  }

  getCookieOptions(): CookieOptions {
    const ttl = this.configService.get<number>('appConfig.jwt.accessTokenTtl')!;
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure:
        this.configService.get<boolean>('appConfig.cookieSecure') === true,
      maxAge: ttl * 1000,
      path: '/',
    };
  }

  private toPublicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName ?? null,
      locale: user.locale,
      localePinned: user.localePinned === true,
      hasFaceTemplate: Boolean(user.faceTemplate),
      hasSafeActionPin: Boolean(user.safeActionPinHash),
      twoFactorEnabled: user.twoFactorEnabled === true,
      suspended: user.suspended === true,
    };
  }

  private emailHint(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain || !local) return '***';
    const keep = local.length <= 2 ? 1 : 2;
    return `${local.slice(0, keep)}***@${domain}`;
  }

  private async issueOtpChallenge(
    user: User,
    purpose: 'login' | 'enable',
    ip?: string,
  ): Promise<LoginOtpChallenge> {
    if (!this.mailService.isConfigured()) {
      throw new BadRequestException(
        'Email 2FA requires SMTP. Set MAIL_HOST, MAIL_PORT, SMTP_USERNAME, SMTP_PASSWORD, and MAIL_FROM.',
      );
    }
    const { challengeId, code } = await this.otpChallenges.create(
      user.id,
      user.email,
      purpose,
    );
    try {
      await this.mailService.sendOtp(user.email, code, purpose);
    } catch (err) {
      this.otpChallenges.consume(challengeId);
      await this.auditService.write({
        userId: user.id,
        userEmail: user.email,
        userDisplayName: user.displayName ?? null,
        action:
          purpose === 'enable' ? 'auth.two_factor_enable' : 'auth.login_otp',
        ip,
        result: 'failure',
        details: err instanceof Error ? err.message : 'mail send failed',
      });
      throw new BadRequestException(
        err instanceof Error
          ? err.message
          : 'Could not send verification email',
      );
    }
    await this.auditService.write({
      userId: user.id,
      userEmail: user.email,
      userDisplayName: user.displayName ?? null,
      action:
        purpose === 'enable' ? 'auth.two_factor_enable' : 'auth.login_otp',
      ip,
      result: 'success',
      details: 'otp_sent',
    });
    return {
      requiresTwoFactor: true,
      challengeId,
      emailHint: this.emailHint(user.email),
    };
  }

  private async completeLogin(
    user: User,
    ip?: string,
    extras?: Partial<LoginSuccess>,
  ) {
    const accessToken = await this.signAccessToken(user);
    await this.auditService.write({
      userId: user.id,
      userEmail: user.email,
      userDisplayName: user.displayName ?? null,
      action: 'auth.login',
      ip,
      result: 'success',
    });
    return {
      accessToken,
      user: this.toPublicUser(user),
      ...extras,
    } satisfies LoginSuccess;
  }

  private async signAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName ?? null,
      tv: user.tokenVersion ?? 0,
    };
    return this.jwtService.signAsync(payload);
  }

  /**
   * TP-40: every authenticated request must see a live, non-suspended user whose
   * tokenVersion still matches the JWT (revoked by logout / password / suspend).
   */
  async assertActiveSession(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.suspended) {
      throw new UnauthorizedException(
        'Account suspended — contact an administrator',
      );
    }
    const tokenVersion = user.tokenVersion ?? 0;
    if ((payload.tv ?? 0) !== tokenVersion) {
      throw new UnauthorizedException('Session revoked');
    }
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName ?? null,
      tv: tokenVersion,
    };
  }

  /** Invalidate all outstanding JWTs for this user (logout / password / suspend). */
  async revokeSessions(userId: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.usersRepository.save(user);
  }

  /**
   * Best-effort revoke from a raw access token (logout). Ignores invalid/expired tokens
   * so the cookie can still be cleared.
   */
  async revokeSessionsFromToken(token: string | undefined): Promise<void> {
    if (!token?.trim()) return;
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('appConfig.jwt.secret'),
        audience: this.configService.get<string>('appConfig.jwt.audience'),
        issuer: this.configService.get<string>('appConfig.jwt.issuer'),
      });
      if (payload?.sub) {
        await this.revokeSessions(payload.sub);
      }
    } catch {
      // Cookie clear still proceeds; Bearer may already be expired.
    }
  }

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.suspended) {
      throw new UnauthorizedException(
        'Account suspended — contact an administrator',
      );
    }
    return user;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ip?: string,
  ) {
    const user = await this.usersRepository.findOneByOrFail({ id: userId });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.usersRepository.save(user);
    await this.auditService.write({
      userId: user.id,
      userEmail: user.email,
      userDisplayName: user.displayName ?? null,
      action: 'auth.password_change',
      ip,
      result: 'success',
    });
    return { ok: true };
  }

  async changeSafeActionPin(
    userId: string,
    currentPin: string | undefined,
    newPin: string,
    ip?: string,
  ) {
    const user = await this.usersRepository.findOneByOrFail({ id: userId });
    await this.safeActionPin.changePin(userId, currentPin, newPin);
    await this.auditService.write({
      userId: user.id,
      userEmail: user.email,
      userDisplayName: user.displayName ?? null,
      action: 'auth.safe_action_pin_change',
      ip,
      result: 'success',
    });
    return { ok: true, hasSafeActionPin: true };
  }

  async login(
    dto: LoginDto,
    ip?: string,
  ): Promise<LoginSuccess | LoginOtpChallenge> {
    try {
      const user = await this.validateUser(dto.email, dto.password);
      if (user.twoFactorEnabled) {
        return this.issueOtpChallenge(user, 'login', ip);
      }
      return this.completeLogin(user, ip);
    } catch (err) {
      await this.auditService.write({
        userEmail: dto.email,
        action: 'auth.login',
        ip,
        result: 'failure',
        details: err instanceof Error ? err.message : 'login failed',
      });
      throw err;
    }
  }

  /**
   * Swagger OAuth password grant — refuse when 2FA is on (no silent bypass).
   */
  async loginPasswordGrant(dto: LoginDto, ip?: string): Promise<LoginSuccess> {
    const result = await this.login(dto, ip);
    if ('requiresTwoFactor' in result) {
      throw new UnauthorizedException(
        'Email 2FA is enabled for this account. Complete POST /auth/login then POST /auth/login/otp.',
      );
    }
    return result;
  }

  async verifyLoginOtp(
    challengeId: string,
    code: string,
    ip?: string,
  ): Promise<LoginSuccess> {
    try {
      const verified = await this.otpChallenges.verify(
        challengeId,
        code,
        'login',
      );
      const user = await this.usersRepository.findOne({
        where: { id: verified.userId },
      });
      if (!user || user.suspended) {
        throw new UnauthorizedException('Invalid or expired code');
      }
      await this.auditService.write({
        userId: user.id,
        userEmail: user.email,
        userDisplayName: user.displayName ?? null,
        action: 'auth.login_otp',
        ip,
        result: 'success',
        details: 'otp_verified',
      });
      return this.completeLogin(user, ip);
    } catch (err) {
      await this.auditService.write({
        action: 'auth.login_otp',
        ip,
        result: 'failure',
        details: err instanceof Error ? err.message : 'otp failed',
      });
      throw err;
    }
  }

  async resendLoginOtp(
    challengeId: string,
    ip?: string,
  ): Promise<LoginOtpChallenge> {
    const existing = this.otpChallenges.peek(challengeId);
    if (!existing || existing.purpose !== 'login') {
      throw new UnauthorizedException('Invalid or expired code');
    }
    const user = await this.usersRepository.findOne({
      where: { id: existing.userId },
    });
    if (!user || user.suspended) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    this.otpChallenges.consume(challengeId);
    return this.issueOtpChallenge(user, 'login', ip);
  }

  async beginEnableTwoFactor(
    userId: string,
    ip?: string,
  ): Promise<LoginOtpChallenge> {
    const user = await this.usersRepository.findOneByOrFail({ id: userId });
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Email 2FA is already enabled');
    }
    return this.issueOtpChallenge(user, 'enable', ip);
  }

  async confirmEnableTwoFactor(
    userId: string,
    challengeId: string,
    code: string,
    ip?: string,
  ) {
    const verified = await this.otpChallenges.verify(
      challengeId,
      code,
      'enable',
    );
    if (verified.userId !== userId) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    const user = await this.usersRepository.findOneByOrFail({ id: userId });
    user.twoFactorEnabled = true;
    await this.usersRepository.save(user);
    await this.auditService.write({
      userId: user.id,
      userEmail: user.email,
      userDisplayName: user.displayName ?? null,
      action: 'auth.two_factor_enable',
      ip,
      result: 'success',
      details: 'enabled',
    });
    return { ok: true, twoFactorEnabled: true, user: this.toPublicUser(user) };
  }

  async disableTwoFactor(userId: string, ip?: string) {
    const user = await this.usersRepository.findOneByOrFail({ id: userId });
    user.twoFactorEnabled = false;
    await this.usersRepository.save(user);
    await this.auditService.write({
      userId: user.id,
      userEmail: user.email,
      userDisplayName: user.displayName ?? null,
      action: 'auth.two_factor_disable',
      ip,
      result: 'success',
    });
    return { ok: true, twoFactorEnabled: false, user: this.toPublicUser(user) };
  }

  async me(payload: JwtPayload) {
    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.suspended) {
      throw new UnauthorizedException(
        'Account suspended — contact an administrator',
      );
    }
    return this.toPublicUser(user);
  }

  /**
   * Enroll local face template (challenge frames required — TP-45). Not ISO-certified.
   * Never used for e-stop / safe-action authorization.
   */
  async enrollFace(userId: string, input: FaceCaptureInput, ip?: string) {
    const user = await this.usersRepository.findOneByOrFail({ id: userId });
    const desc = this.descriptorFromCapture(input);
    const key = this.faceKey();
    user.faceTemplate = key
      ? sealTemplate(desc, key)
      : serializeDescriptor(desc);
    await this.usersRepository.save(user);
    await this.auditService.write({
      userId: user.id,
      userEmail: user.email,
      userDisplayName: user.displayName ?? null,
      action: 'auth.face_enroll',
      details: `challenge_frames=${input.frames!.length}`,
      ip,
      result: 'success',
    });
    return {
      ok: true,
      limitation:
        'Local on-prem face match with challenge liveness — not ISO-certified. Prefer password for high-assurance access. Face never authorizes e-stop or SAFE_ACTION_PIN.',
    };
  }

  /**
   * Face login: match against enrolled templates. Fail closed to password.
   */
  async loginWithFace(
    input: FaceCaptureInput,
    emailHint?: string,
    ip?: string,
  ) {
    try {
      const probe = this.descriptorFromCapture(input);
      const key = this.faceKey();
      const candidates = emailHint
        ? await this.usersRepository.find({ where: { email: emailHint } })
        : await this.usersRepository.find();

      let best: { user: User; score: number } | null = null;
      for (const user of candidates) {
        if (!user.faceTemplate) continue;
        let stored: number[];
        try {
          stored = openTemplate(user.faceTemplate, key || undefined);
        } catch {
          continue;
        }
        const score = matchScore(probe, stored);
        if (!best || score > best.score) {
          best = { user, score };
        }
      }

      if (!best || best.score < FACE_MATCH_THRESHOLD) {
        throw new UnauthorizedException(
          'Face match failed — use password login',
        );
      }
      if (best.user.suspended) {
        throw new UnauthorizedException(
          'Account suspended — contact an administrator',
        );
      }

      await this.auditService.write({
        userId: best.user.id,
        userEmail: best.user.email,
        userDisplayName: best.user.displayName ?? null,
        action: 'auth.face_login',
        details: `score=${best.score.toFixed(3)};challenge_frames=${input.frames!.length}`,
        ip,
        result: 'success',
      });
      if (best.user.twoFactorEnabled) {
        return this.issueOtpChallenge(best.user, 'login', ip);
      }
      const accessToken = await this.signAccessToken(best.user);
      return {
        accessToken,
        user: this.toPublicUser(best.user),
        matchScore: best.score,
        limitation:
          'Local on-prem face match — not ISO-certified. Fail closed to password. Face never authorizes safety actions.',
      };
    } catch (err) {
      const details = err instanceof Error ? err.message : 'face login failed';
      const spoof = /liveness|motion|No face/i.test(details);
      await this.auditService.write({
        userEmail: emailHint,
        action: spoof ? 'auth.face_spoof' : 'auth.face_login',
        ip,
        result: 'failure',
        details,
      });
      throw err;
    }
  }

  async updateLocale(userId: string, locale: string) {
    const user = await this.usersRepository.findOneByOrFail({ id: userId });
    const lower = locale.toLowerCase();
    const normalized = lower.startsWith('es')
      ? 'es'
      : lower.startsWith('fr')
        ? 'fr'
        : lower.startsWith('de')
          ? 'de'
          : lower.startsWith('en')
            ? 'en'
            : null;
    if (!normalized) {
      throw new BadRequestException('Locale must be en, es, fr, or de');
    }
    user.locale = normalized;
    user.localePinned = true;
    await this.usersRepository.save(user);
    return this.toPublicUser(user);
  }

  private faceKey(): string {
    return this.configService.get<string>('appConfig.faceTemplateKey') ?? '';
  }

  /** TP-45: challenge frames only — single still imageDataUrl is rejected. */
  private descriptorFromCapture(input: FaceCaptureInput): number[] {
    try {
      if (input.frames && input.frames.length >= 3) {
        return descriptorFromChallengeFrames(input.frames);
      }
      throw new BadRequestException(
        'Challenge frames required: provide frames[3] (center, turn-left, turn-right). Single imageDataUrl is not accepted (TP-45).',
      );
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const message =
        err instanceof Error ? err.message : 'Face capture rejected';
      throw new BadRequestException(message);
    }
  }
}
