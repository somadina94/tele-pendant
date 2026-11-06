import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PNG } from 'pngjs';
import { AuthService } from './auth.service';
import { UserRole } from '../../users/enums/user-role.enum';
import * as faceUtil from './face.util';
import {
  descriptorFromImageDataUrl,
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
    if (key === 'appConfig.faceTemplateKey') return '';
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
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.password_change' }),
    );
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

  it('rejects face login for suspended accounts after a match', async () => {
    const image = faceUrl('blob');
    const enrolled = serializeDescriptor(descriptorFromImageDataUrl(image));
    usersRepository.find.mockResolvedValue([
      { ...user, suspended: true, faceTemplate: enrolled },
    ]);
    await expect(
      service.loginWithFace({ imageDataUrl: image }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
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
    const result = await service.enrollFace(
      user.id,
      { imageDataUrl: image },
      '127.0.0.1',
    );
    expect(result.ok).toBe(true);
    expect(usersRepository.save).toHaveBeenCalled();
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.face_enroll',
        result: 'success',
      }),
    );
  });

  it('enrolls face and audits null displayName', async () => {
    const image = faceUrl('blob');
    usersRepository.findOneByOrFail.mockResolvedValue({
      ...user,
      displayName: null,
    });
    await service.enrollFace(user.id, { imageDataUrl: image });
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
    const image = faceUrl('blob');
    usersRepository.findOneByOrFail.mockResolvedValue({ ...user });
    await service.enrollFace(user.id, { imageDataUrl: image });
    const saved = usersRepository.save.mock.calls[0][0] as {
      faceTemplate: string;
    };
    expect(saved.faceTemplate.startsWith('v1:')).toBe(true);
    expect(openTemplate(saved.faceTemplate, key).length).toBeGreaterThan(0);

    const sealed = sealTemplate(descriptorFromImageDataUrl(image), key);
    usersRepository.find.mockResolvedValue([{ ...user, faceTemplate: sealed }]);
    const ok = await service.loginWithFace({ imageDataUrl: image });
    expect(ok.accessToken).toBe('token');
  });

  it('face login audits null displayName on success', async () => {
    const image = faceUrl('blob');
    const enrolled = serializeDescriptor(descriptorFromImageDataUrl(image));
    usersRepository.find.mockResolvedValue([
      { ...user, displayName: null, faceTemplate: enrolled },
    ]);
    await service.loginWithFace({ imageDataUrl: image });
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        userDisplayName: null,
        action: 'auth.face_login',
        result: 'success',
      }),
    );
  });

  it('rejects empty face capture and skips unreadable sealed templates', async () => {
    configService.get.mockImplementation((k: string) => {
      if (k === 'appConfig.faceTemplateKey') return undefined;
      return defaultConfig(k);
    });
    await expect(service.loginWithFace({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    jest
      .spyOn(faceUtil, 'descriptorFromImageDataUrl')
      .mockImplementationOnce(() => {
        // Cover non-Error reject path in descriptorFromCapture.
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- intentional
        throw 'raw-reject';
      });
    await expect(
      service.loginWithFace({ imageDataUrl: faceUrl('blob') }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'Face capture rejected' }),
    });

    const image = faceUrl('blob');
    usersRepository.find.mockResolvedValue([
      { ...user, faceTemplate: 'v1:bad:sealed:template' },
    ]);
    await expect(
      service.loginWithFace({ imageDataUrl: image }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('enrolls with challenge frame details when motion is present', async () => {
    function shiftedFace(shift: number) {
      const png = new PNG({ width: 64, height: 64 });
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const left = 4 + shift;
          const right = 28 + shift;
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
    usersRepository.findOneByOrFail.mockResolvedValue({ ...user });
    await service.enrollFace(user.id, {
      frames: [shiftedFace(0), shiftedFace(18), shiftedFace(36)],
    });
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

    const ok = await service.loginWithFace({ imageDataUrl: image });
    expect(ok.accessToken).toBe('token');
    expect(ok.user.email).toBe(user.email);
    expect(ok.matchScore).toBeGreaterThan(0.9);
  });

  it('face login fails closed and audits non-Error', async () => {
    const image = faceUrl('blob');
    usersRepository.find.mockResolvedValue([{ ...user, faceTemplate: null }]);
    await expect(
      service.loginWithFace({ imageDataUrl: image }, user.email),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const rejectValue = { code: 'face-boom' };
    usersRepository.find.mockRejectedValue(rejectValue);
    await expect(service.loginWithFace({ imageDataUrl: image })).rejects.toBe(
      rejectValue,
    );
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
