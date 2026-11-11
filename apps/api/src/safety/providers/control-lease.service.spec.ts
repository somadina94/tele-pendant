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
    const claimed = service.claim('u1', 'Alice', 'c1');
    expect(claimed.youHold).toBe(true);
    expect(claimed.holderDisplayName).toBe('Alice');
    expect(claimed.holderClientId).toBe('c1');
    expect(service.holds('u1', 'c1')).toBe(true);
    expect(service.holds('u1', 'c2')).toBe(false);
    expect(service.holds('u2', 'c1')).toBe(false);
    expect(service.heartbeat('u1', 'c1').youHold).toBe(true);
  });

  it('blocks a second claim while the lease is live', () => {
    service.claim('u1', 'Alice', 'c1');
    expect(() => service.claim('u2', 'Bob', 'c2')).toThrow(ConflictException);
  });

  it('blocks the same account on a second device without steal', () => {
    service.claim('u1', 'Alice', 'phone');
    expect(() => service.claim('u1', 'Alice', 'tablet')).toThrow(
      ConflictException,
    );
    expect(service.holds('u1', 'phone')).toBe(true);
    expect(service.holds('u1', 'tablet')).toBe(false);
  });

  it('refreshes when the same user and client reclaim', () => {
    service.claim('u1', 'Alice', 'c1');
    expect(service.claim('u1', 'Alice', 'c1').youHold).toBe(true);
  });

  it('rejects claim without a client id', () => {
    expect(() => service.claim('u1', 'Alice', '')).toThrow(ForbiddenException);
  });

  it('expires without heartbeat and allows reclaim', () => {
    service.claim('u1', 'Alice', 'c1');
    jest.setSystemTime(new Date('2026-01-01T00:00:13Z'));
    expect(service.holds('u1', 'c1')).toBe(false);
    expect(service.claim('u2', 'Bob', 'c2').youHold).toBe(true);
  });

  it('steal transfers the lease to another client', () => {
    service.claim('u1', 'Alice', 'c1');
    const stolen = service.steal('u2', 'Bob', 'c2');
    expect(stolen.previousUserId).toBe('u1');
    expect(stolen.control.youHold).toBe(true);
    expect(stolen.control.holderClientId).toBe('c2');
    expect(service.holds('u1', 'c1')).toBe(false);
    expect(service.holds('u2', 'c2')).toBe(true);
  });

  it('steal lets the same user take over from another device', () => {
    service.claim('u1', 'Alice', 'phone');
    const stolen = service.steal('u1', 'Alice', 'tablet');
    expect(stolen.previousUserId).toBe('u1');
    expect(service.holds('u1', 'tablet')).toBe(true);
    expect(service.holds('u1', 'phone')).toBe(false);
  });

  it('assertHolds explains free vs occupied', () => {
    expect(() => service.assertHolds('u1', 'c1')).toThrow(ForbiddenException);
    service.claim('u1', 'Alice', 'c1');
    expect(() => service.assertHolds('u2', 'c2')).toThrow(
      /Control held by Alice/,
    );
    expect(() => service.assertHolds('u1', 'c2')).toThrow(
      /Control held by Alice/,
    );
    expect(() => service.assertHolds('u1', 'c1')).not.toThrow();
  });

  it('release clears the lease for the holder client only', () => {
    service.claim('u1', 'Alice', 'c1');
    expect(() => service.release('u1', 'c2')).toThrow(ForbiddenException);
    expect(() => service.release('u2', 'c2')).toThrow(ForbiddenException);
    expect(service.release('u1', 'c1').held).toBe(false);
  });

  it('rejects heartbeat from the wrong client', () => {
    service.claim('u1', 'Alice', 'c1');
    expect(() => service.heartbeat('u1', 'c2')).toThrow(ForbiddenException);
  });
});
