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
  /** Client session that holds the lease (tab / device). */
  holderClientId: string | null;
  youHold: boolean;
  expiresAt: string | null;
};

@Injectable()
export class ControlLeaseService {
  /** Lease dies without heartbeat (Operator polls ~4s). */
  private readonly ttlMs = 12_000;
  private holderUserId: string | null = null;
  private holderDisplayName: string | null = null;
  private holderClientId: string | null = null;
  private lastBeatAt: number | null = null;

  snapshot(
    forUserId?: string | null,
    forClientId?: string | null,
  ): ControlLeaseView {
    this.expireIfStale();
    const held = Boolean(this.holderUserId);
    const client = (forClientId ?? '').trim();
    return {
      held,
      holderUserId: this.holderUserId,
      holderDisplayName: this.holderDisplayName,
      holderClientId: this.holderClientId,
      youHold: Boolean(
        forUserId &&
        client &&
        this.holderUserId &&
        this.holderClientId &&
        forUserId === this.holderUserId &&
        client === this.holderClientId,
      ),
      expiresAt:
        held && this.lastBeatAt
          ? new Date(this.lastBeatAt + this.ttlMs).toISOString()
          : null,
    };
  }

  /** True when this user+client currently holds a non-expired lease. */
  holds(userId?: string | null, clientId?: string | null): boolean {
    this.expireIfStale();
    const id = (userId ?? '').trim();
    const client = (clientId ?? '').trim();
    if (!id || !client || !this.holderUserId || !this.holderClientId) {
      return false;
    }
    return id === this.holderUserId && client === this.holderClientId;
  }

  assertHolds(userId?: string | null, clientId?: string | null): void {
    if (this.holds(userId, clientId)) return;
    const view = this.snapshot(userId, clientId);
    if (view.held) {
      throw new ForbiddenException(
        `Control held by ${view.holderDisplayName || view.holderUserId}`,
      );
    }
    throw new ForbiddenException('Claim exclusive control before moving');
  }

  claim(
    userId: string,
    displayName?: string | null,
    clientId?: string | null,
  ): ControlLeaseView {
    const id = userId.trim();
    const client = (clientId ?? '').trim();
    if (!id) throw new ForbiddenException('Not signed in');
    if (!client) throw new ForbiddenException('Missing control client id');
    this.expireIfStale();
    if (this.holderUserId && this.holderClientId) {
      const sameUser = this.holderUserId === id;
      const sameClient = this.holderClientId === client;
      if (!sameUser || !sameClient) {
        throw new ConflictException(
          `Control held by ${this.holderDisplayName || this.holderUserId}`,
        );
      }
    }
    this.holderUserId = id;
    this.holderDisplayName = (displayName ?? '').trim() || id;
    this.holderClientId = client;
    this.lastBeatAt = Date.now();
    return this.snapshot(id, client);
  }

  heartbeat(userId: string, clientId?: string | null): ControlLeaseView {
    const id = userId.trim();
    const client = (clientId ?? '').trim();
    this.expireIfStale();
    if (!this.holds(id, client)) {
      throw new ForbiddenException('You do not hold control');
    }
    this.lastBeatAt = Date.now();
    return this.snapshot(id, client);
  }

  release(userId: string, clientId?: string | null): ControlLeaseView {
    const id = userId.trim();
    const client = (clientId ?? '').trim();
    this.expireIfStale();
    if (this.holderUserId) {
      if (!this.holds(id, client)) {
        throw new ForbiddenException('You do not hold control');
      }
    }
    this.clear();
    return this.snapshot(id, client);
  }

  /**
   * Take over from another holder (PIN already verified by caller).
   * Returns previous holder id if any.
   */
  steal(
    userId: string,
    displayName?: string | null,
    clientId?: string | null,
  ): { control: ControlLeaseView; previousUserId: string | null } {
    const id = userId.trim();
    const client = (clientId ?? '').trim();
    if (!id) throw new ForbiddenException('Not signed in');
    if (!client) throw new ForbiddenException('Missing control client id');
    this.expireIfStale();
    const previousUserId =
      this.holderUserId &&
      (this.holderUserId !== id || this.holderClientId !== client)
        ? this.holderUserId
        : null;
    this.holderUserId = id;
    this.holderDisplayName = (displayName ?? '').trim() || id;
    this.holderClientId = client;
    this.lastBeatAt = Date.now();
    return { control: this.snapshot(id, client), previousUserId };
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
    this.holderClientId = null;
    this.lastBeatAt = null;
  }
}
