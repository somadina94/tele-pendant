import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/** FEAT-A5: one exclusive Operator controller per API (demo crane / active PLC). */
export type ControlLeaseView = {
  held: boolean;
  holderUserId: string | null;
  holderDisplayName: string | null;
  youHold: boolean;
  expiresAt: string | null;
};

@Injectable()
export class ControlLeaseService {
  /** Lease dies without heartbeat (Operator polls ~4s). */
  private readonly ttlMs = 12_000;
  private holderUserId: string | null = null;
  private holderDisplayName: string | null = null;
  private lastBeatAt: number | null = null;

  snapshot(forUserId?: string | null): ControlLeaseView {
    this.expireIfStale();
    const held = Boolean(this.holderUserId);
    return {
      held,
      holderUserId: this.holderUserId,
      holderDisplayName: this.holderDisplayName,
      youHold: Boolean(
        forUserId && this.holderUserId && forUserId === this.holderUserId,
      ),
      expiresAt:
        held && this.lastBeatAt
          ? new Date(this.lastBeatAt + this.ttlMs).toISOString()
          : null,
    };
  }

  /** True when this user currently holds a non-expired lease. */
  holds(userId?: string | null): boolean {
    this.expireIfStale();
    if (!userId || !this.holderUserId) return false;
    return userId === this.holderUserId;
  }

  assertHolds(userId?: string | null): void {
    if (this.holds(userId)) return;
    const view = this.snapshot(userId);
    if (view.held) {
      throw new ForbiddenException(
        `Control held by ${view.holderDisplayName || view.holderUserId}`,
      );
    }
    throw new ForbiddenException('Claim exclusive control before moving');
  }

  claim(userId: string, displayName?: string | null): ControlLeaseView {
    const id = userId.trim();
    if (!id) throw new ForbiddenException('Not signed in');
    this.expireIfStale();
    if (this.holderUserId && this.holderUserId !== id) {
      throw new ConflictException(
        `Control held by ${this.holderDisplayName || this.holderUserId}`,
      );
    }
    this.holderUserId = id;
    this.holderDisplayName = (displayName ?? '').trim() || id;
    this.lastBeatAt = Date.now();
    return this.snapshot(id);
  }

  heartbeat(userId: string): ControlLeaseView {
    const id = userId.trim();
    this.expireIfStale();
    if (!this.holds(id)) {
      throw new ForbiddenException('You do not hold control');
    }
    this.lastBeatAt = Date.now();
    return this.snapshot(id);
  }

  release(userId: string): ControlLeaseView {
    const id = userId.trim();
    this.expireIfStale();
    if (this.holderUserId && this.holderUserId !== id) {
      throw new ForbiddenException('You do not hold control');
    }
    this.clear();
    return this.snapshot(id);
  }

  /**
   * Take over from another holder (PIN already verified by caller).
   * Returns previous holder id if any.
   */
  steal(
    userId: string,
    displayName?: string | null,
  ): { control: ControlLeaseView; previousUserId: string | null } {
    const id = userId.trim();
    if (!id) throw new ForbiddenException('Not signed in');
    this.expireIfStale();
    const previousUserId =
      this.holderUserId && this.holderUserId !== id ? this.holderUserId : null;
    this.holderUserId = id;
    this.holderDisplayName = (displayName ?? '').trim() || id;
    this.lastBeatAt = Date.now();
    return { control: this.snapshot(id), previousUserId };
  }

  expireIfStale(): boolean {
    if (!this.holderUserId || this.lastBeatAt == null) return false;
    if (Date.now() - this.lastBeatAt <= this.ttlMs) return false;
    this.clear();
    return true;
  }

  private clear(): void {
    this.holderUserId = null;
    this.holderDisplayName = null;
    this.lastBeatAt = null;
  }
}
