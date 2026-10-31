import {
  Inject,
  Injectable,
  OnModuleInit,
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
  cosineSimilarity,
  descriptorFromImageDataUrl,
  FACE_MATCH_THRESHOLD,
  parseDescriptor,
  serializeDescriptor,
} from './face.util';

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
   * Enroll a basic face template for the current user (convenience auth only).
   */
  async enrollFace(userId: string, imageDataUrl: string, ip?: string) {
    const user = await this.usersRepository.findOneByOrFail({ id: userId });
    const desc = descriptorFromImageDataUrl(imageDataUrl);
    user.faceTemplate = serializeDescriptor(desc);
    await this.usersRepository.save(user);
    await this.auditService.write({
      userId: user.id,
      userEmail: user.email,
      action: 'auth.face_enroll',
      ip,
      result: 'success',
    });
    return {
      ok: true,
      limitation:
        'Basic convenience match only — not a high-assurance biometric product. Prefer password when unsure.',
    };
  }

  /**
   * Face login: match against enrolled templates. Fail closed to password.
   */
  async loginWithFace(imageDataUrl: string, emailHint?: string, ip?: string) {
    try {
      const probe = descriptorFromImageDataUrl(imageDataUrl);
      const candidates = emailHint
        ? await this.usersRepository.find({ where: { email: emailHint } })
        : await this.usersRepository.find();

      let best: { user: User; score: number } | null = null;
      for (const user of candidates) {
        if (!user.faceTemplate) continue;
        const stored = parseDescriptor(user.faceTemplate);
        const score = cosineSimilarity(probe, stored);
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
        details: `score=${best.score.toFixed(3)}`,
        ip,
        result: 'success',
      });
      return {
        accessToken,
        user: this.toPublicUser(best.user),
        matchScore: best.score,
        limitation: 'Basic convenience match only — not certified biometrics.',
      };
    } catch (err) {
      await this.auditService.write({
        userEmail: emailHint,
        action: 'auth.face_login',
        ip,
        result: 'failure',
        details: err instanceof Error ? err.message : 'face login failed',
      });
      throw err;
    }
  }
}
