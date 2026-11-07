import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class SafeActionPinService {
  private readonly users: Repository<User>;

  constructor(@InjectRepository(User) users: Repository<User>) {
    this.users = users;
  }

  plantPinFallback(): string {
    return (process.env.SAFE_ACTION_PIN || '').trim();
  }

  async verify(userId: string | undefined, pin: string): Promise<boolean> {
    const provided = pin.trim();
    if (!provided) return false;
    if (!userId) {
      return this.matchesPlantPin(provided);
    }
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
        throw new UnauthorizedException('Current reset PIN is incorrect');
      }
    }
    user.safeActionPinHash = await bcrypt.hash(next, 12);
    await this.users.save(user);
  }
}
