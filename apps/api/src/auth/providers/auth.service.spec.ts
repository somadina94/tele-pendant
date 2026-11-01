import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PNG } from 'pngjs';
import { AuthService } from './auth.service';
import { UserRole } from '../../users/enums/user-role.enum';
import { descriptorFromImageDataUrl, serializeDescriptor } from './face.util';

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
  };
  const configService = {
    get: jest.fn(),
  };
  const auditService = {
    write: jest.fn().mockResolvedValue({}),
  };

  let service: AuthService;

  function defaultConfig(key: string) {
    if (key === 'appConfig.jwt.accessTokenTtl') return 3600;
    if (key === 'appConfig.cookieSecure') return false;
    if (key === 'appConfig.admin.email') return 'admin@example.com';
    if (key === 'appConfig.admin.password') return 'change-me-admin-password';
    return undefined;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    user.faceTemplate = null;
    user.displayName = 'Admin';
    configService.get.mockImplementation(defaultConfig);
    service = new AuthService(
      usersRepository as never,
      jwtService as never,
      configService as never,
      auditService as never,
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

    expect(result.accessToken).toBe('token');
    expect(result.user.displayName).toBeNull();
    expect(result.user.hasFaceTemplate).toBe(false);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login', result: 'success' }),
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
    const image = faceUrl('blob');
    usersRepository.findOneByOrFail.mockResolvedValue({ ...user });
    const result = await service.enrollFace(user.id, image, '127.0.0.1');
    expect(result.ok).toBe(true);
    expect(usersRepository.save).toHaveBeenCalled();
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.face_enroll',
        result: 'success',
      }),
    );
  });

  it('face login picks best match across candidates', async () => {
    const image = faceUrl('blob');
    const weak = faceUrl('ring');
    const enrolled = {
      ...user,
      faceTemplate: serializeDescriptor(descriptorFromImageDataUrl(image)),
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
      faceTemplate: serializeDescriptor(descriptorFromImageDataUrl(weak)),
    };
    usersRepository.find.mockResolvedValue([
      { ...user, faceTemplate: null },
      other,
      enrolled,
      twin, // equal score → ! (score > best.score)
    ]);

    const ok = await service.loginWithFace(image);
    expect(ok.accessToken).toBe('token');
    expect(ok.user.email).toBe(user.email);
    expect(ok.matchScore).toBeGreaterThan(0.9);
  });

  it('face login fails closed and audits non-Error', async () => {
    const image = faceUrl('blob');
    usersRepository.find.mockResolvedValue([{ ...user, faceTemplate: null }]);
    await expect(
      service.loginWithFace(image, user.email),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const rejectValue = { code: 'face-boom' };
    usersRepository.find.mockRejectedValue(rejectValue);
    await expect(service.loginWithFace(image)).rejects.toBe(rejectValue);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.face_login',
        result: 'failure',
        details: 'face login failed',
      }),
    );
  });

  it('pins en or es and rejects anything else', async () => {
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
    await expect(service.updateLocale(user.id, 'fr')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
