import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway', () => {
  const safetyState = {
    pulseDeadman: jest.fn(),
    releaseDeadman: jest.fn().mockResolvedValue({ mode: 'normal' }),
    snapshot: jest.fn().mockReturnValue({ mode: 'normal' }),
  };

  let gateway: RealtimeGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new RealtimeGateway(safetyState as never);
  });

  it('drops deadman and motion coils when a realtime socket disconnects', () => {
    gateway.handleDisconnect({ id: 'sock-1' } as never);
    expect(safetyState.releaseDeadman).toHaveBeenCalled();
  });

  it('pulses and releases deadman on messages', async () => {
    expect(gateway.handleDeadmanPulse()).toEqual({ mode: 'normal' });
    expect(safetyState.pulseDeadman).toHaveBeenCalled();
    await expect(gateway.handleDeadmanRelease()).resolves.toEqual({
      mode: 'normal',
    });
    expect(safetyState.releaseDeadman).toHaveBeenCalled();
  });
});
