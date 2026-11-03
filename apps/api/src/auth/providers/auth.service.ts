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
import { LoginDto } from '../dtos/login.dto';
import {
  descriptorFromChallengeFrames,
  descriptorFromImageDataUrl,
  FACE_MATCH_THRESHOLD,
  matchScore,
  openTemplate,
  sealTemplate,
  serializeDescriptor,
} from './face.util';

export type FaceCaptureInput = {
  imageDataUrl?: string;
  frames?: string[];
};

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

/**
 * Authentication: bootstrap admin, password login, JWT cookie/bearer.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly usersRepository: Repository<User>;
  private readonly jwtService: JwtService;
  private readonly configService: ConfigService;
  private readonly auditService: AuditService;

  constructor(
    @InjectRepository(User)
    usersRepository: Repository<User>,
    @Inject(JwtService) jwtService: JwtService,
    @Inject(ConfigService) configService: ConfigService,
    @Inject(AuditService) auditService: AuditService,
  ) {
    this.usersRepository = usersRepository;
    this.jwtService = jwtService;
    this.configService = configService;
    this.auditService = auditService;
  }

  async onModuleInit(): Promise<void> {
    const email = this.configService.get<string>('appConfig.admin.email');
    const password = this.configService.get<string>('appConfig.admin.password');
    if (!email || !password) return;

    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(password, 12);
    await this.usersRepository.save(
      this.usersRepository.create({
        email,
        passwordHash,
        role: UserRole.ADMIN,
        displayName: 'Administrator',
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
    };
  }

  private async signAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.signAsync(payload);
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
    return user;
  }

  async login(dto: LoginDto, ip?: string) {
    try {
      const user = await this.validateUser(dto.email, dto.password);
      const accessToken = await this.signAccessToken(user);
      await this.auditService.write({
        userId: user.id,
        userEmail: user.email,
        action: 'auth.login',
        ip,
        result: 'success',
      });
      return {
        accessToken,
        user: this.toPublicUser(user),
      };
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

  async me(payload: JwtPayload) {
    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.toPublicUser(user);
  }

  /**
   * Enroll local face template (challenge frames preferred). Not ISO-certified.
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
      action: 'auth.face_enroll',
      details: input.frames?.length
        ? `challenge_frames=${input.frames.length}`
        : 'single_frame',
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

      const accessToken = await this.signAccessToken(best.user);
      await this.auditService.write({
        userId: best.user.id,
        userEmail: best.user.email,
        action: 'auth.face_login',
        details: `score=${best.score.toFixed(3)};challenge=${Boolean(input.frames?.length)}`,
        ip,
        result: 'success',
      });
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

  private descriptorFromCapture(input: FaceCaptureInput): number[] {
    if (input.frames && input.frames.length >= 3) {
      return descriptorFromChallengeFrames(input.frames);
    }
    if (input.imageDataUrl) {
      return descriptorFromImageDataUrl(input.imageDataUrl);
    }
    throw new BadRequestException(
      'Provide frames[3] for challenge liveness (or imageDataUrl)',
    );
  }
}
