import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/providers/audit.service';
import { User } from '../entities/user.entity';

@Injectable()
export class SafeActionPinService {
  private readonly users: Repository<User>;
  private readonly audit: AuditService;
  private readonly maxFails = 5;
  private readonly lockMs = 15 * 60 * 1000;
  private readonly attempts = new Map<
    string,
    { fails: number; lockedUntil: number }
  >();

  constructor(
    @InjectRepository(User) users: Repository<User>,
    @Inject(AuditService) audit: AuditService,
  ) {
    this.users = users;
    this.audit = audit;
  }

  plantPinFallback(): string {
    return (process.env.SAFE_ACTION_PIN || '').trim();
  }

  async verify(userId: string | undefined, pin: string): Promise<boolean> {
    this.assertUnlocked(userId);
    const provided = pin.trim();
    if (!provided) return false;
    const ok = await this.pinMatches(userId, provided);
    if (ok) {
      this.attempts.delete(this.attemptKey(userId));
      return true;
    }
    await this.noteFailure(userId);
    return false;
  }

  private attemptKey(userId: string | undefined): string {
    return userId?.trim() || 'plant';
  }

  private assertUnlocked(userId: string | undefined): void {
    const state = this.attempts.get(this.attemptKey(userId));
    if (state && state.lockedUntil > Date.now()) {
      throw new ForbiddenException(
        'Reset PIN is locked. Try again in 15 minutes',
      );
    }
  }

  private async noteFailure(userId: string | undefined): Promise<void> {
    const key = this.attemptKey(userId);
    const state = this.attempts.get(key);
    const expired = Boolean(
      state && state.lockedUntil > 0 && state.lockedUntil <= Date.now(),
    );
    const fails = (expired ? 0 : (state?.fails ?? 0)) + 1;
    if (fails >= this.maxFails) {
      this.attempts.set(key, { fails, lockedUntil: Date.now() + this.lockMs });
      try {
        await this.audit.write({
          userId: userId?.trim() || null,
          action: 'safety.pin_lockout',
          resource: 'safe-action-pin',
          details: 'locked for 15 minutes after 5 wrong PINs',
          result: 'failure',
        });
      } catch {
        // The lockout still stands if the audit row cannot be stored.
      }
      throw new ForbiddenException(
        'Reset PIN is locked. Try again in 15 minutes',
      );
    }
    this.attempts.set(key, { fails, lockedUntil: 0 });
  }

  private async pinMatches(
    userId: string | undefined,
    provided: string,
  ): Promise<boolean> {
    if (!userId) return this.matchesPlantPin(provided);
    const user = await this.users.findOneBy({ id: userId });
    if (!user) return false;
    if (user.safeActionPinHash) {
      return bcrypt.compare(provided, user.safeActionPinHash);
    }
    return this.matchesPlantPin(provided);
  }

  private matchesPlantPin(provided: string): boolean {
    const expected = this.plantPinFallback();
    return Boolean(expected && provided === expected);
  }

  /**
   * TP-38: first personal PIN requires the plant PIN (or later the current
   * personal PIN). Empty currentPin must never grant e-stop reset rights.
   */
  async changePin(
    userId: string,
    currentPin: string | undefined,
    newPin: string,
  ): Promise<void> {
    const next = newPin.trim();
    if (next.length < 4) {
      throw new BadRequestException('Reset PIN must be at least 4 characters');
    }
    this.assertUnlocked(userId);
    const user = await this.users.findOneByOrFail({ id: userId });
    const current = (currentPin ?? '').trim();
    if (!current) {
      throw new BadRequestException(
        user.safeActionPinHash
          ? 'Current reset PIN is required'
          : 'Plant reset PIN is required to set your first personal PIN',
      );
    }

    if (user.safeActionPinHash) {
      const ok = await bcrypt.compare(current, user.safeActionPinHash);
      if (!ok) {
        await this.noteFailure(userId);
        throw new UnauthorizedException('Current reset PIN is incorrect');
      }
    } else {
      const plant = this.plantPinFallback();
      if (!plant) {
        throw new BadRequestException(
          'Plant reset PIN is not configured — ask an administrator',
        );
      }
      if (!this.matchesPlantPin(current)) {
        await this.noteFailure(userId);
        throw new UnauthorizedException('Current reset PIN is incorrect');
      }
    }
    this.attempts.delete(this.attemptKey(userId));
    user.safeActionPinHash = await bcrypt.hash(next, 12);
    await this.users.save(user);
  }
}
