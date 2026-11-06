import {
  BadRequestException,
  Inject,
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
    const hasPersonalPin = Boolean(user.safeActionPinHash);
    if (hasPersonalPin) {
      const current = (currentPin ?? '').trim();
      if (!current) {
        throw new BadRequestException('Current reset PIN is required');
      }
      const ok = await bcrypt.compare(current, user.safeActionPinHash!);
      if (!ok) {
        throw new UnauthorizedException('Current reset PIN is incorrect');
      }
    } else {
      const current = (currentPin ?? '').trim();
      if (current) {
        const ok = await this.matchesPlantPin(current);
        if (!ok) {
          throw new UnauthorizedException('Current reset PIN is incorrect');
        }
      }
    }
    user.safeActionPinHash = await bcrypt.hash(next, 12);
    await this.users.save(user);
  }
}
