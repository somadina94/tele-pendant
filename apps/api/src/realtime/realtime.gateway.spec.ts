import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway', () => {
  const safetyState = {
    pulseDeadman: jest.fn(),
    releaseDeadman: jest.fn().mockResolvedValue({ mode: 'normal' }),
    snapshot: jest
      .fn()
      .mockReturnValue({ mode: 'normal', deadmanActive: false }),
  };
  const jwtService = {
    verifyAsync: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'appConfig.jwt.secret') return 'test-secret';
      if (key === 'appConfig.jwt.audience') return 'tele-pendant';
      if (key === 'appConfig.jwt.issuer') return 'tele-pendant-api';
      return undefined;
    }),
  };
  const authService = {
    assertActiveSession: jest.fn(async (payload: { sub: string }) => payload),
  };

  let gateway: RealtimeGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    authService.assertActiveSession.mockImplementation(
      async (payload: { sub: string }) => payload,
    );
    gateway = new RealtimeGateway(
      safetyState as never,
      jwtService as never,
      configService as never,
      authService as never,
    );
  });

  function client(partial: {
    id?: string;
    auth?: { token?: string };
    authorization?: string;
    cookie?: string;
    user?: { sub: string };
    disconnect?: jest.Mock;
  }) {
    return {
      id: partial.id ?? 'sock-1',
      data: { user: partial.user },
      handshake: {
        auth: partial.auth ?? {},
        headers: {
          authorization: partial.authorization,
          cookie: partial.cookie,
        },
      },
      disconnect: partial.disconnect ?? jest.fn(),
    };
  }

  it('rejects sockets without a JWT (TP-37)', async () => {
    const disconnect = jest.fn();
    await gateway.handleConnection(client({ disconnect }) as never);
    expect(disconnect).toHaveBeenCalledWith(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('accepts a socket with auth.token and stores the user', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'u1',
      email: 'op@example.com',
      role: 'operator',
    });
    const sock = client({ auth: { token: 'jwt-token' } });
    await gateway.handleConnection(sock as never);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith(
      'jwt-token',
      expect.objectContaining({ secret: 'test-secret' }),
    );
    expect(sock.data.user).toEqual(expect.objectContaining({ sub: 'u1' }));
    expect(sock.disconnect).not.toHaveBeenCalled();
  });

  it('accepts Bearer and cookie tokens', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'u2' });
    await gateway.handleConnection(
      client({ authorization: 'Bearer abc' }) as never,
    );
    expect(jwtService.verifyAsync).toHaveBeenCalledWith(
      'abc',
      expect.any(Object),
    );

    jwtService.verifyAsync.mockResolvedValue({ sub: 'u3' });
    await gateway.handleConnection(
      client({ cookie: 'other=1; access_token=cook%2Die; x=y' }) as never,
    );
    expect(jwtService.verifyAsync).toHaveBeenCalledWith(
      'cook-ie',
      expect.any(Object),
    );
  });

  it('disconnects when JWT verification fails', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const disconnect = jest.fn();
    await gateway.handleConnection(
      client({ auth: { token: 'bad' }, disconnect }) as never,
    );
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects when the session is suspended or revoked (TP-40)', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'u1' });
    authService.assertActiveSession.mockRejectedValue(
      new Error('Account suspended — contact an administrator'),
    );
    const disconnect = jest.fn();
    await gateway.handleConnection(
      client({ auth: { token: 'stale' }, disconnect }) as never,
    );
    expect(authService.assertActiveSession).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects when the payload has no sub', async () => {
    jwtService.verifyAsync.mockResolvedValue({});
    const disconnect = jest.fn();
    await gateway.handleConnection(
      client({ auth: { token: 'nosub' }, disconnect }) as never,
    );
    expect(disconnect).toHaveBeenCalledWith(true);
    expect(authService.assertActiveSession).not.toHaveBeenCalled();
  });

  it('releases only the disconnecting socket holder (TP-37)', () => {
    gateway.handleDisconnect(client({ id: 'sock-9' }) as never);
    expect(safetyState.releaseDeadman).toHaveBeenCalledWith({
      socketId: 'sock-9',
    });
  });

  it('pulses and releases deadman for the authenticated socket user', async () => {
    const sock = client({
      id: 'sock-2',
      user: { sub: 'u1' },
    });
    expect(gateway.handleDeadmanPulse(sock as never)).toEqual({
      mode: 'normal',
      deadmanActive: false,
    });
    expect(safetyState.pulseDeadman).toHaveBeenCalledWith({
      userId: 'u1',
      socketId: 'sock-2',
    });
    await expect(gateway.handleDeadmanRelease(sock as never)).resolves.toEqual({
      mode: 'normal',
    });
    expect(safetyState.releaseDeadman).toHaveBeenCalledWith({
      userId: 'u1',
      socketId: 'sock-2',
    });
  });

  it('ignores pulse when the socket has no user', () => {
    gateway.handleDeadmanPulse(client({ user: undefined }) as never);
    expect(safetyState.pulseDeadman).not.toHaveBeenCalled();
    expect(safetyState.snapshot).toHaveBeenCalled();
  });

  it('returns safety snapshot on safety.get', () => {
    expect(gateway.handleSafetyGet()).toEqual({
      mode: 'normal',
      deadmanActive: false,
    });
  });
});
