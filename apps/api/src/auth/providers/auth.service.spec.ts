import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PNG } from 'pngjs';
import { AuthService } from './auth.service';
import { UserRole } from '../../users/enums/user-role.enum';
import * as faceUtil from './face.util';
import {
  descriptorFromChallengeFrames,
  openTemplate,
  sealTemplate,
  serializeDescriptor,
} from './face.util';

function faceUrl(mode: 'blob' | 'ring'): string {
  const png = new PNG({ width: 48, height: 48 });
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      const skin =
        mode === 'blob'
          ? x > 10 && x < 38 && y > 10 && y < 38
          : x < 8 || y < 8 || x >= 40 || y >= 40;
      const i = (y * 48 + x) << 2;
      png.data[i] = skin ? 210 : 20;
      png.data[i + 1] = skin ? 140 : 20;
      png.data[i + 2] = skin ? 110 : 20;
      png.data[i + 3] = 255;
    }
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}

/** Three challenge frames with enough motion for liveness (TP-45). */
function challengeFrames(baseShift = 0): string[] {
  function shifted(shift: number) {
    const png = new PNG({ width: 64, height: 64 });
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const left = 4 + baseShift + shift;
        const right = 28 + baseShift + shift;
        const skin = x > left && x < right && y > 16 && y < 48;
        const i = (y * 64 + x) << 2;
        png.data[i] = skin ? 210 : 20;
        png.data[i + 1] = skin ? 140 : 20;
        png.data[i + 2] = skin ? 110 : 20;
        png.data[i + 3] = 255;
      }
    }
    return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
  }
  return [shifted(0), shifted(18), shifted(36)];
}

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  const user = {
    id: 'u1',
    email: 'admin@example.com',
    passwordHash: 'hash',
    role: UserRole.ADMIN,
    displayName: 'Admin' as string | null | undefined,
    locale: 'en',
    faceTemplate: null as string | null,
    suspended: false,
    tokenVersion: 0,
    twoFactorEnabled: false,
    safeActionPinHash: null as string | null,
  };

  const usersRepository = {
    findOne: jest.fn(),
    findOneByOrFail: jest.fn(),
    find: jest.fn(),
    save: jest.fn().mockImplementation(async (x) => x),
    create: jest.fn((x) => x),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('token'),
    verifyAsync: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };
  const auditService = {
    write: jest.fn().mockResolvedValue({}),
  };
  const safeActionPin = {
    plantPinFallback: jest.fn(() => ''),
    changePin: jest.fn().mockResolvedValue(undefined),
  };
  const mailService = {
    isConfigured: jest.fn(() => true),
    sendOtp: jest.fn().mockResolvedValue(undefined),
  };
  const otpChallenges = {
    create: jest.fn().mockResolvedValue({
      challengeId: 'chal-1',
      code: '123456',
    }),
    peek: jest.fn(),
    verify: jest.fn(),
    consume: jest.fn(),
  };

  let service: AuthService;

  function defaultConfig(key: string) {
    if (key === 'appConfig.jwt.accessTokenTtl') return 3600;
    if (key === 'appConfig.cookieSecure') return false;
    if (key === 'appConfig.admin.email') return 'admin@example.com';
    if (key === 'appConfig.admin.password') return 'change-me-admin-password';
    if (key === 'appConfig.faceTemplateKey') return '';
    return undefined;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    user.faceTemplate = null;
    user.displayName = 'Admin';
    user.suspended = false;
    user.tokenVersion = 0;
    user.passwordHash = 'hash';
    user.twoFactorEnabled = false;
    configService.get.mockImplementation(defaultConfig);
    safeActionPin.plantPinFallback.mockReturnValue('');
    mailService.isConfigured.mockReturnValue(true);
    mailService.sendOtp.mockResolvedValue(undefined);
    otpChallenges.create.mockResolvedValue({
      challengeId: 'chal-1',
      code: '123456',
    });
    service = new AuthService(
      usersRepository as never,
      jwtService as never,
      configService as never,
      auditService as never,
      safeActionPin as never,
      mailService as never,
      otpChallenges as never,
    );
  });

  it('bootstraps admin when missing', async () => {
    usersRepository.findOne.mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    await service.onModuleInit();
    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        safeActionPinHash: null,
      }),
    );
  });

  it('bootstraps admin with plant reset PIN hash when SAFE_ACTION_PIN is set', async () => {
    usersRepository.findOne.mockResolvedValue(null);
    safeActionPin.plantPinFallback.mockReturnValue('plant-pin');
    (bcrypt.hash as jest.Mock)
      .mockResolvedValueOnce('pwd-hash')
      .mockResolvedValueOnce('pin-hash');
    await service.onModuleInit();
    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@example.com',
        passwordHash: 'pwd-hash',
        safeActionPinHash: 'pin-hash',
      }),
    );
  });

  it('skips bootstrap when admin exists or env missing', async () => {
    usersRepository.findOne.mockResolvedValue(user);
    await service.onModuleInit();
    expect(usersRepository.save).not.toHaveBeenCalled();

    configService.get.mockImplementation((key: string) => {
      if (key === 'appConfig.admin.email') return undefined;
      if (key === 'appConfig.admin.password') return 'x';
      return defaultConfig(key);
    });
    await service.onModuleInit();
    expect(usersRepository.save).not.toHaveBeenCalled();

    configService.get.mockImplementation((key: string) => {
      if (key === 'appConfig.admin.email') return 'a@b.com';
      if (key === 'appConfig.admin.password') return undefined;
      return defaultConfig(key);
    });
    await service.onModuleInit();
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('returns cookie options including secure true', () => {
    expect(service.getCookieOptions().secure).toBe(false);
    configService.get.mockImplementation((key: string) => {
      if (key === 'appConfig.cookieSecure') return true;
      return defaultConfig(key);
    });
    expect(service.getCookieOptions().secure).toBe(true);
    expect(service.getCookieOptions().maxAge).toBe(3600_000);
  });

  it('logs in with valid credentials and null displayName', async () => {
    usersRepository.findOne.mockResolvedValue({
      ...user,
      displayName: undefined,
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.login({
      email: user.email,
      password: 'change-me-admin-password',
    });

    expect('accessToken' in result && result.accessToken).toBe('token');
    if (!('accessToken' in result)) throw new Error('expected token');
    expect(result.user.displayName).toBeNull();
    expect(result.user.hasFaceTemplate).toBe(false);
    expect(result.user.twoFactorEnabled).toBe(false);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login', result: 'success' }),
    );
  });

  it('challenges login with email OTP when 2FA is on', async () => {
    usersRepository.findOne.mockResolvedValue({
      ...user,
      twoFactorEnabled: true,
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const result = await service.login({
      email: user.email,
      password: 'change-me-admin-password',
    });
    expect(result).toEqual(
      expect.objectContaining({
        requiresTwoFactor: true,
        challengeId: 'chal-1',
        emailHint: 'ad***@example.com',
      }),
    );
    expect(mailService.sendOtp).toHaveBeenCalledWith(
      user.email,
      '123456',
      'login',
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('refuses password-grant when 2FA is on', async () => {
    usersRepository.findOne.mockResolvedValue({
      ...user,
      twoFactorEnabled: true,
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    await expect(
      service.loginPasswordGrant({
        email: user.email,
        password: 'change-me-admin-password',
      }),
    ).rejects.toThrow(/Email 2FA/i);
  });

  it('password-grant returns token when 2FA is off', async () => {
    usersRepository.findOne.mockResolvedValue({ ...user });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const result = await service.loginPasswordGrant({
      email: user.email,
      password: 'change-me-admin-password',
    });
    expect(result.accessToken).toBe('token');
  });

  it('completes login after OTP verify', async () => {
    otpChallenges.verify.mockResolvedValue({
      userId: user.id,
      email: user.email,
    });
    usersRepository.findOne.mockResolvedValue({
      ...user,
      displayName: null,
    });
    const result = await service.verifyLoginOtp('chal-1', '123456', '1.1.1.1');
    expect(result.accessToken).toBe('token');
    expect(result.user.displayName).toBeNull();
    expect(otpChallenges.verify).toHaveBeenCalledWith(
      'chal-1',
      '123456',
      'login',
    );
  });

  it('rejects OTP verify for missing or suspended users', async () => {
    otpChallenges.verify.mockResolvedValue({
      userId: user.id,
      email: user.email,
    });
    usersRepository.findOne.mockResolvedValue(null);
    await expect(
      service.verifyLoginOtp('chal-1', '123456'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    usersRepository.findOne.mockResolvedValue({ ...user, suspended: true });
    await expect(
      service.verifyLoginOtp('chal-1', '123456'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('resends login OTP from an existing challenge', async () => {
    otpChallenges.peek.mockReturnValue({
      userId: user.id,
      email: user.email,
      purpose: 'login',
      codeHash: 'x',
      expiresAt: Date.now() + 60_000,
      attempts: 0,
    });
    usersRepository.findOne.mockResolvedValue({
      ...user,
      twoFactorEnabled: true,
    });
    const result = await service.resendLoginOtp('chal-old');
    expect(otpChallenges.consume).toHaveBeenCalledWith('chal-old');
    expect(result.challengeId).toBe('chal-1');
  });

  it('rejects resend when challenge is missing', async () => {
    otpChallenges.peek.mockReturnValue(null);
    await expect(service.resendLoginOtp('gone')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects resend when user is gone or suspended', async () => {
    otpChallenges.peek.mockReturnValue({
      userId: user.id,
      email: user.email,
      purpose: 'login',
      codeHash: 'x',
      expiresAt: Date.now() + 60_000,
      attempts: 0,
    });
    usersRepository.findOne.mockResolvedValue(null);
    await expect(service.resendLoginOtp('chal-old')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    usersRepository.findOne.mockResolvedValue({ ...user, suspended: true });
    await expect(service.resendLoginOtp('chal-old')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('enables 2FA after confirm OTP and disables immediately', async () => {
    usersRepository.findOneByOrFail.mockResolvedValue({
      ...user,
      twoFactorEnabled: false,
    });
    const begin = await service.beginEnableTwoFactor(user.id);
    expect(begin.requiresTwoFactor).toBe(true);
    expect(mailService.sendOtp).toHaveBeenCalledWith(
      user.email,
      '123456',
      'enable',
    );

    otpChallenges.verify.mockResolvedValue({
      userId: user.id,
      email: user.email,
    });
    usersRepository.findOneByOrFail.mockResolvedValue({
      ...user,
      twoFactorEnabled: false,
    });
    await expect(
      service.confirmEnableTwoFactor(user.id, 'chal-1', '123456'),
    ).resolves.toEqual(
      expect.objectContaining({ ok: true, twoFactorEnabled: true }),
    );

    usersRepository.findOneByOrFail.mockResolvedValue({
      ...user,
      twoFactorEnabled: true,
    });
    await expect(service.disableTwoFactor(user.id)).resolves.toEqual(
      expect.objectContaining({ ok: true, twoFactorEnabled: false }),
    );
  });

  it('refuses enable when already on or SMTP missing', async () => {
    usersRepository.findOneByOrFail.mockResolvedValue({
      ...user,
      twoFactorEnabled: true,
    });
    await expect(service.beginEnableTwoFactor(user.id)).rejects.toThrow(
      /already enabled/i,
    );

    usersRepository.findOneByOrFail.mockResolvedValue({
      ...user,
      twoFactorEnabled: false,
    });
    mailService.isConfigured.mockReturnValue(false);
    await expect(service.beginEnableTwoFactor(user.id)).rejects.toThrow(
      /SMTP/i,
    );
  });

  it('consumes challenge when mail send fails', async () => {
    usersRepository.findOne.mockResolvedValue({
      ...user,
      twoFactorEnabled: true,
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mailService.sendOtp.mockRejectedValue(new Error('smtp down'));
    await expect(
      service.login({ email: user.email, password: 'x' }),
    ).rejects.toThrow(/smtp down/i);
    expect(otpChallenges.consume).toHaveBeenCalledWith('chal-1');
  });

  it('handles non-Error mail failures and short email hints', async () => {
    usersRepository.findOne.mockResolvedValue({
      ...user,
      email: 'ab@x.com',
      twoFactorEnabled: true,
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const okHint = await service.login({
      email: 'ab@x.com',
      password: 'x',
    });
    expect(okHint).toEqual(
      expect.objectContaining({ emailHint: 'a***@x.com' }),
    );

    usersRepository.findOne.mockResolvedValue({
      ...user,
      email: '@orphan.tld',
      displayName: null,
      twoFactorEnabled: true,
    });
    const blankLocal = await service.login({
      email: '@orphan.tld',
      password: 'x',
    });
    expect(blankLocal).toEqual(expect.objectContaining({ emailHint: '***' }));

    usersRepository.findOneByOrFail.mockResolvedValue({
      ...user,
      displayName: undefined,
      twoFactorEnabled: false,
    });
    mailService.sendOtp.mockRejectedValueOnce('boom');
    await expect(service.beginEnableTwoFactor(user.id)).rejects.toThrow(
      /Could not send verification email/i,
    );

    otpChallenges.verify.mockRejectedValueOnce('bad');
    await expect(service.verifyLoginOtp('chal-1', '000000')).rejects.toBe(
      'bad',
    );
  });

  it('confirm and disable 2FA with null displayName', async () => {
    otpChallenges.verify.mockResolvedValue({
      userId: user.id,
      email: user.email,
    });
    const row = {
      ...user,
      displayName: null,
      twoFactorEnabled: false,
    };
    usersRepository.findOneByOrFail.mockResolvedValue(row);
    await expect(
      service.confirmEnableTwoFactor(user.id, 'chal-1', '123456'),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        twoFactorEnabled: true,
        user: expect.objectContaining({ displayName: null }),
      }),
    );
    row.twoFactorEnabled = true;
    await expect(service.disableTwoFactor(user.id, '9.9.9.9')).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        twoFactorEnabled: false,
      }),
    );
  });

  it('rejects confirm enable for another user challenge', async () => {
    otpChallenges.verify.mockResolvedValue({
      userId: 'other',
      email: 'o@x.com',
    });
    await expect(
      service.confirmEnableTwoFactor(user.id, 'chal-1', '123456'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects suspended accounts on login and me', async () => {
    usersRepository.findOne.mockResolvedValue({ ...user, suspended: true });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    await expect(
      service.login({ email: user.email, password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    usersRepository.findOne.mockResolvedValue({ ...user, suspended: true });
    await expect(
      service.me({ sub: user.id, email: user.email, role: user.role }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('changes password when current password matches', async () => {
    usersRepository.findOneByOrFail.mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
    await expect(
      service.changePassword(user.id, 'old', 'new-password', '127.0.0.1'),
    ).resolves.toEqual({ ok: true });
    expect(user.tokenVersion).toBe(1);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.password_change' }),
    );
  });

  it('assertActiveSession accepts live users and rejects suspended/missing/revoked (TP-40)', async () => {
    usersRepository.findOne.mockResolvedValue({
      ...user,
      tokenVersion: 2,
      displayName: null,
    });
    await expect(
      service.assertActiveSession({
        sub: user.id,
        email: user.email,
        role: user.role,
        tv: 2,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        sub: user.id,
        email: user.email,
        tv: 2,
        displayName: null,
      }),
    );

    usersRepository.findOne.mockResolvedValue(null);
    await expect(
      service.assertActiveSession({
        sub: 'gone',
        email: 'x',
        role: UserRole.OPERATOR,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    usersRepository.findOne.mockResolvedValue({ ...user, suspended: true });
    await expect(
      service.assertActiveSession({
        sub: user.id,
        email: user.email,
        role: user.role,
        tv: 0,
      }),
    ).rejects.toThrow(/suspended/i);

    usersRepository.findOne.mockResolvedValue({ ...user, tokenVersion: 3 });
    await expect(
      service.assertActiveSession({
        sub: user.id,
        email: user.email,
        role: user.role,
        tv: 0,
      }),
    ).rejects.toThrow(/revoked/i);
  });

  it('revokes sessions and ignores bad logout tokens (TP-40)', async () => {
    const noTv = { ...user, tokenVersion: undefined as unknown as number };
    usersRepository.findOne.mockResolvedValue(noTv);
    await service.revokeSessions(user.id);
    expect(noTv.tokenVersion).toBe(1);
    expect(usersRepository.save).toHaveBeenCalled();

    usersRepository.findOne.mockResolvedValue(null);
    await service.revokeSessions('missing');

    jwtService.verifyAsync.mockResolvedValue({ sub: user.id });
    usersRepository.findOne.mockResolvedValue(user);
    await service.revokeSessionsFromToken('good-token');
    expect(jwtService.verifyAsync).toHaveBeenCalled();

    jwtService.verifyAsync.mockResolvedValue({});
    await service.revokeSessionsFromToken('no-sub');

    await service.revokeSessionsFromToken(undefined);
    await service.revokeSessionsFromToken('   ');
    jwtService.verifyAsync.mockRejectedValue(new Error('expired'));
    await service.revokeSessionsFromToken('stale');
  });

  it('treats missing tokenVersion as zero when asserting, signing, and changing password (TP-40)', async () => {
    usersRepository.findOne.mockResolvedValue({
      ...user,
      tokenVersion: undefined,
      displayName: undefined,
    });
    await expect(
      service.assertActiveSession({
        sub: user.id,
        email: user.email,
        role: user.role,
      }),
    ).resolves.toEqual(expect.objectContaining({ tv: 0, displayName: null }));

    usersRepository.findOne.mockResolvedValue({
      ...user,
      tokenVersion: undefined,
      displayName: undefined,
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    await service.login({ email: user.email, password: 'x' });
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ tv: 0, displayName: null }),
    );

    const pwdUser = {
      ...user,
      tokenVersion: undefined as unknown as number,
    };
    usersRepository.findOneByOrFail.mockResolvedValue(pwdUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
    await service.changePassword(user.id, 'old', 'new-password');
    expect(pwdUser.tokenVersion).toBe(1);
  });

  it('rejects change password when current password is wrong', async () => {
    usersRepository.findOneByOrFail.mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(
      service.changePassword(user.id, 'wrong', 'new-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('audits password change with null displayName', async () => {
    usersRepository.findOneByOrFail.mockResolvedValue({
      ...user,
      displayName: null,
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
    await service.changePassword(user.id, 'old', 'new-password');
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        userDisplayName: null,
        action: 'auth.password_change',
      }),
    );
  });

  it('changes safe action pin and audits', async () => {
    usersRepository.findOneByOrFail.mockResolvedValue(user);
    safeActionPin.changePin = jest.fn().mockResolvedValue(undefined);
    await expect(
      service.changeSafeActionPin(user.id, 'old', '1234', '127.0.0.1'),
    ).resolves.toEqual({ ok: true, hasSafeActionPin: true });
    expect(safeActionPin.changePin).toHaveBeenCalledWith(
      user.id,
      'old',
      '1234',
    );
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.safe_action_pin_change',
        ip: '127.0.0.1',
        result: 'success',
      }),
    );
  });

  it('audits safe action pin change with null displayName', async () => {
    usersRepository.findOneByOrFail.mockResolvedValue({
      ...user,
      displayName: null,
    });
    safeActionPin.changePin = jest.fn().mockResolvedValue(undefined);
    await service.changeSafeActionPin(user.id, undefined, '9999');
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        userDisplayName: null,
        action: 'auth.safe_action_pin_change',
      }),
    );
  });

  it('rejects face login for suspended accounts after a match', async () => {
    const frames = challengeFrames();
    const enrolled = serializeDescriptor(descriptorFromChallengeFrames(frames));
    usersRepository.find.mockResolvedValue([
      { ...user, suspended: true, faceTemplate: enrolled },
    ]);
    await expect(service.loginWithFace({ frames })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects unknown user and wrong password', async () => {
    usersRepository.findOne.mockResolvedValue(null);
    await expect(
      service.login({ email: 'x@example.com', password: 'nope' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    usersRepository.findOne.mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(
      service.login({ email: user.email, password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login', result: 'failure' }),
    );
  });

  it('audits non-Error login failures', async () => {
    const rejectValue = { code: 'raw-fail' };
    usersRepository.findOne.mockRejectedValue(rejectValue);
    await expect(
      service.login({ email: user.email, password: 'x' }),
    ).rejects.toBe(rejectValue);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failure',
        details: 'login failed',
      }),
    );
  });

  it('returns me for known user and rejects missing', async () => {
    usersRepository.findOne.mockResolvedValue(user);
    await expect(
      service.me({ sub: user.id, email: user.email, role: user.role }),
    ).resolves.toEqual(
      expect.objectContaining({ id: user.id, email: user.email }),
    );

    usersRepository.findOne.mockResolvedValue(null);
    await expect(
      service.me({ sub: 'missing', email: 'x', role: UserRole.OPERATOR }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('enrolls face template', async () => {
    const frames = challengeFrames();
    usersRepository.findOneByOrFail.mockResolvedValue({ ...user });
    const result = await service.enrollFace(user.id, { frames }, '127.0.0.1');
    expect(result.ok).toBe(true);
    expect(usersRepository.save).toHaveBeenCalled();
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.face_enroll',
        details: 'challenge_frames=3',
        result: 'success',
      }),
    );
  });

  it('enrolls face and audits null displayName', async () => {
    const frames = challengeFrames();
    usersRepository.findOneByOrFail.mockResolvedValue({
      ...user,
      displayName: null,
    });
    await service.enrollFace(user.id, { frames });
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        userDisplayName: null,
        action: 'auth.face_enroll',
      }),
    );
  });

  it('seals enrolled templates when FACE_TEMPLATE_KEY is set', async () => {
    const key = 'unit-test-face-template-key-32chars!!';
    configService.get.mockImplementation((k: string) => {
      if (k === 'appConfig.faceTemplateKey') return key;
      return defaultConfig(k);
    });
    const frames = challengeFrames();
    usersRepository.findOneByOrFail.mockResolvedValue({ ...user });
    await service.enrollFace(user.id, { frames });
    const saved = usersRepository.save.mock.calls[0][0] as {
      faceTemplate: string;
    };
    expect(saved.faceTemplate.startsWith('v1:')).toBe(true);
    expect(openTemplate(saved.faceTemplate, key).length).toBeGreaterThan(0);

    const sealed = sealTemplate(descriptorFromChallengeFrames(frames), key);
    usersRepository.find.mockResolvedValue([{ ...user, faceTemplate: sealed }]);
    const ok = await service.loginWithFace({ frames });
    expect(ok).toEqual(expect.objectContaining({ accessToken: 'token' }));
  });

  it('face login audits null displayName on success', async () => {
    const frames = challengeFrames();
    const enrolled = serializeDescriptor(descriptorFromChallengeFrames(frames));
    usersRepository.find.mockResolvedValue([
      { ...user, displayName: null, faceTemplate: enrolled },
    ]);
    await service.loginWithFace({ frames });
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        userDisplayName: null,
        action: 'auth.face_login',
        result: 'success',
      }),
    );
  });

  it('face login challenges OTP when 2FA is on', async () => {
    const frames = challengeFrames();
    const enrolled = serializeDescriptor(descriptorFromChallengeFrames(frames));
    usersRepository.find.mockResolvedValue([
      { ...user, twoFactorEnabled: true, faceTemplate: enrolled },
    ]);
    const result = await service.loginWithFace({ frames });
    expect(result).toEqual(
      expect.objectContaining({
        requiresTwoFactor: true,
        challengeId: 'chal-1',
      }),
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rejects single still imageDataUrl and empty capture (TP-45)', async () => {
    configService.get.mockImplementation((k: string) => {
      if (k === 'appConfig.faceTemplateKey') return undefined;
      return defaultConfig(k);
    });
    await expect(service.loginWithFace({})).rejects.toThrow(/frames\[3\]/);
    await expect(
      service.loginWithFace({ imageDataUrl: faceUrl('blob') }),
    ).rejects.toThrow(/frames\[3\]|TP-45/);
    usersRepository.findOneByOrFail.mockResolvedValue({ ...user });
    await expect(
      service.enrollFace(user.id, { imageDataUrl: faceUrl('blob') }),
    ).rejects.toThrow(/frames\[3\]|TP-45/);

    jest
      .spyOn(faceUtil, 'descriptorFromChallengeFrames')
      .mockImplementationOnce(() => {
        // Cover non-Error reject path in descriptorFromCapture.
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- intentional
        throw 'raw-reject';
      });
    await expect(
      service.loginWithFace({ frames: challengeFrames() }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'Face capture rejected' }),
    });

    const frames = challengeFrames();
    usersRepository.find.mockResolvedValue([
      { ...user, faceTemplate: 'v1:bad:sealed:template' },
    ]);
    await expect(service.loginWithFace({ frames })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('enrolls with challenge frame details when motion is present', async () => {
    usersRepository.findOneByOrFail.mockResolvedValue({ ...user });
    await service.enrollFace(user.id, { frames: challengeFrames() });
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.face_enroll',
        details: 'challenge_frames=3',
      }),
    );
  });

  it('audits face spoof when liveness fails on challenge frames', async () => {
    const still = faceUrl('blob');
    usersRepository.find.mockResolvedValue([{ ...user, faceTemplate: null }]);
    await expect(
      service.loginWithFace({ frames: [still, still, still] }),
    ).rejects.toThrow(/Liveness failed|No face/);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.face_spoof',
        result: 'failure',
      }),
    );
  });

  it('face login picks best match across candidates', async () => {
    const frames = challengeFrames();
    const weakFrames = challengeFrames(20);
    const enrolled = {
      ...user,
      faceTemplate: serializeDescriptor(descriptorFromChallengeFrames(frames)),
    };
    const twin = {
      ...user,
      id: 'u3',
      email: 'twin@example.com',
      faceTemplate: enrolled.faceTemplate,
    };
    const other = {
      ...user,
      id: 'u2',
      email: 'other@example.com',
      faceTemplate: serializeDescriptor(
        descriptorFromChallengeFrames(weakFrames),
      ),
    };
    usersRepository.find.mockResolvedValue([
      { ...user, faceTemplate: null },
      other,
      enrolled,
      twin, // equal score → ! (score > best.score)
    ]);

    const ok = await service.loginWithFace({ frames });
    expect(ok).toEqual(
      expect.objectContaining({
        accessToken: 'token',
        user: expect.objectContaining({ email: user.email }),
        matchScore: expect.any(Number),
      }),
    );
    if (!('matchScore' in ok)) {
      throw new Error('expected face login session');
    }
    expect(ok.matchScore).toBeGreaterThan(0.9);
  });

  it('face login fails closed and audits non-Error', async () => {
    const frames = challengeFrames();
    usersRepository.find.mockResolvedValue([{ ...user, faceTemplate: null }]);
    await expect(
      service.loginWithFace({ frames }, user.email),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const rejectValue = { code: 'face-boom' };
    usersRepository.find.mockRejectedValue(rejectValue);
    await expect(service.loginWithFace({ frames })).rejects.toBe(rejectValue);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.face_login',
        result: 'failure',
        details: 'face login failed',
      }),
    );
  });

  it('pins en/es/fr/de and rejects anything else', async () => {
    usersRepository.findOneByOrFail.mockResolvedValue({
      ...user,
      locale: 'en',
    });
    const spanish = await service.updateLocale(user.id, 'es-MX');
    expect(spanish.locale).toBe('es');
    expect(spanish.localePinned).toBe(true);
    usersRepository.findOneByOrFail.mockResolvedValue({
      ...user,
      locale: 'es',
    });
    const english = await service.updateLocale(user.id, 'EN');
    expect(english.locale).toBe('en');
    usersRepository.findOneByOrFail.mockResolvedValue({ ...user });
    expect((await service.updateLocale(user.id, 'fr-FR')).locale).toBe('fr');
    usersRepository.findOneByOrFail.mockResolvedValue({ ...user });
    expect((await service.updateLocale(user.id, 'de')).locale).toBe('de');
    await expect(service.updateLocale(user.id, 'it')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
