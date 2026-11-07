import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ControlLeaseService } from './control-lease.service';

describe('ControlLeaseService (FEAT-A5)', () => {
  let service: ControlLeaseService;

  beforeEach(() => {
    service = new ControlLeaseService();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lets the first user claim and heartbeat', () => {
    const claimed = service.claim('u1', 'Alice');
    expect(claimed.youHold).toBe(true);
    expect(claimed.holderDisplayName).toBe('Alice');
    expect(service.holds('u1')).toBe(true);
    expect(service.holds('u2')).toBe(false);
    expect(service.heartbeat('u1').youHold).toBe(true);
  });

  it('blocks a second claim while the lease is live', () => {
    service.claim('u1', 'Alice');
    expect(() => service.claim('u2', 'Bob')).toThrow(ConflictException);
  });

  it('expires without heartbeat and allows reclaim', () => {
    service.claim('u1', 'Alice');
    jest.setSystemTime(new Date('2026-01-01T00:00:13Z'));
    expect(service.holds('u1')).toBe(false);
    expect(service.claim('u2', 'Bob').youHold).toBe(true);
  });

  it('steal transfers the lease', () => {
    service.claim('u1', 'Alice');
    const stolen = service.steal('u2', 'Bob');
    expect(stolen.previousUserId).toBe('u1');
    expect(stolen.control.youHold).toBe(true);
    expect(service.holds('u1')).toBe(false);
  });

  it('assertHolds explains free vs occupied', () => {
    expect(() => service.assertHolds('u1')).toThrow(ForbiddenException);
    service.claim('u1', 'Alice');
    expect(() => service.assertHolds('u2')).toThrow(/Control held by Alice/);
    expect(() => service.assertHolds('u1')).not.toThrow();
  });

  it('release clears the lease for the holder only', () => {
    service.claim('u1', 'Alice');
    expect(() => service.release('u2')).toThrow(ForbiddenException);
    expect(service.release('u1').held).toBe(false);
  });
});
