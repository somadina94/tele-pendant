import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';

export type OtpPurpose = 'login' | 'enable';

type Challenge = {
  userId: string;
  email: string;
  codeHash: string;
  purpose: OtpPurpose;
  expiresAt: number;
  attempts: number;
};

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class OtpChallengeService {
  private readonly challenges = new Map<string, Challenge>();

  /** Create a challenge and return { challengeId, code } (code only for mailing). */
  async create(
    userId: string,
    email: string,
    purpose: OtpPurpose,
  ): Promise<{ challengeId: string; code: string }> {
    this.purgeExpired();
    for (const [id, row] of this.challenges) {
      if (row.userId === userId && row.purpose === purpose) {
        this.challenges.delete(id);
      }
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const challengeId = randomUUID();
    const codeHash = await bcrypt.hash(code, 10);
    this.challenges.set(challengeId, {
      userId,
      email,
      codeHash,
      purpose,
      expiresAt: Date.now() + TTL_MS,
      attempts: 0,
    });
    return { challengeId, code };
  }

  peek(challengeId: string): Challenge | null {
    const row = this.challenges.get(challengeId);
    if (!row) return null;
    if (row.expiresAt <= Date.now()) {
      this.challenges.delete(challengeId);
      return null;
    }
    return row;
  }

  async verify(
    challengeId: string,
    code: string,
    purpose: OtpPurpose,
  ): Promise<{ userId: string; email: string }> {
    const row = this.peek(challengeId);
    if (!row || row.purpose !== purpose) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    row.attempts += 1;
    if (row.attempts > MAX_ATTEMPTS) {
      this.challenges.delete(challengeId);
      throw new UnauthorizedException(
        'Too many invalid codes — request a new one',
      );
    }
    const ok = await bcrypt.compare(code.trim(), row.codeHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    this.challenges.delete(challengeId);
    return { userId: row.userId, email: row.email };
  }

  consume(challengeId: string): void {
    this.challenges.delete(challengeId);
  }

  private purgeExpired() {
    const now = Date.now();
    for (const [id, row] of this.challenges) {
      if (row.expiresAt <= now) this.challenges.delete(id);
    }
  }
}
