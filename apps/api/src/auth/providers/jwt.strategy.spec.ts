import { UnauthorizedException } from '@nestjs/common';
import { ACCESS_TOKEN_COOKIE } from '../../common/constants';
import { UserRole } from '../../users/enums/user-role.enum';
import { extractAccessToken, JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'appConfig.jwt.secret') return 'test-secret';
      if (key === 'appConfig.jwt.audience') return 'tele-pendant';
      if (key === 'appConfig.jwt.issuer') return 'tele-pendant-api';
      return undefined;
    }),
  };
  const authService = {
    assertActiveSession: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      if (key === 'appConfig.jwt.secret') return 'test-secret';
      if (key === 'appConfig.jwt.audience') return 'tele-pendant';
      if (key === 'appConfig.jwt.issuer') return 'tele-pendant-api';
      return undefined;
    });
  });

  it('throws when JWT secret is missing', () => {
    configService.get.mockImplementation(() => undefined);
    expect(
      () => new JwtStrategy(configService as never, authService as never),
    ).toThrow(/JWT secret/);
  });

  it('returns the active session from AuthService (TP-40)', async () => {
    const strategy = new JwtStrategy(
      configService as never,
      authService as never,
    );
    const session = {
      sub: 'u1',
      email: 'op@example.com',
      role: UserRole.OPERATOR,
      tv: 1,
    };
    authService.assertActiveSession.mockResolvedValue(session);
    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'op@example.com',
        role: UserRole.OPERATOR,
        tv: 1,
      }),
    ).resolves.toEqual(session);
  });

  it('re-throws UnauthorizedException and wraps other errors', async () => {
    const strategy = new JwtStrategy(
      configService as never,
      authService as never,
    );
    authService.assertActiveSession.mockRejectedValue(
      new UnauthorizedException('Account suspended — contact an administrator'),
    );
    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'op@example.com',
        role: UserRole.OPERATOR,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    authService.assertActiveSession.mockRejectedValue(new Error('db down'));
    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'op@example.com',
        role: UserRole.OPERATOR,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('extractAccessToken', () => {
  it('prefers the access_token cookie over Authorization', () => {
    expect(
      extractAccessToken({
        cookies: { [ACCESS_TOKEN_COOKIE]: 'from-cookie' },
        headers: { authorization: 'Bearer from-header' },
      } as never),
    ).toBe('from-cookie');
  });

  it('falls back to Bearer and returns null when absent', () => {
    expect(
      extractAccessToken({
        cookies: {},
        headers: { authorization: 'Bearer from-header' },
      } as never),
    ).toBe('from-header');
    expect(
      extractAccessToken({ cookies: {}, headers: {} } as never),
    ).toBeNull();
  });
});
