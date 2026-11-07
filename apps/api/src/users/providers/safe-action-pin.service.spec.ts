import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SafeActionPinService } from './safe-action-pin.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('SafeActionPinService', () => {
  const users = {
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    save: jest.fn(async (u) => u),
  };
  let service: SafeActionPinService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SAFE_ACTION_PIN;
    service = new SafeActionPinService(users as never);
  });

  it('verifies plant fallback when user has no personal hash', async () => {
    process.env.SAFE_ACTION_PIN = 'plant';
    users.findOneBy.mockResolvedValue({ id: 'u1', safeActionPinHash: null });
    await expect(service.verify('u1', 'plant')).resolves.toBe(true);
    await expect(service.verify('u1', 'wrong')).resolves.toBe(false);
  });

  it('verifies personal hash when set and rejects empty or missing user', async () => {
    users.findOneBy.mockResolvedValue({
      id: 'u1',
      safeActionPinHash: 'hash',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    await expect(service.verify('u1', '1234')).resolves.toBe(true);
    expect(bcrypt.compare).toHaveBeenCalledWith('1234', 'hash');

    await expect(service.verify('u1', '   ')).resolves.toBe(false);
    process.env.SAFE_ACTION_PIN = 'plant';
    await expect(service.verify(undefined, 'plant')).resolves.toBe(true);
    users.findOneBy.mockResolvedValue(null);
    await expect(service.verify('gone', 'plant')).resolves.toBe(false);
  });

  it('requires plant PIN for first personal PIN (TP-38)', async () => {
    process.env.SAFE_ACTION_PIN = 'plant';
    users.findOneByOrFail.mockResolvedValue({
      id: 'u1',
      safeActionPinHash: null,
    });
    (bcrypt.hash as jest.Mock).mockResolvedValue('newhash');

    await expect(
      service.changePin('u1', undefined, '5678'),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.changePin('u1', 'wrong', '5678'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await service.changePin('u1', 'plant', '5678');
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({ safeActionPinHash: 'newhash' }),
    );
  });

  it('blocks first PIN when plant PIN is not configured (TP-38)', async () => {
    users.findOneByOrFail.mockResolvedValue({
      id: 'u1',
      safeActionPinHash: null,
    });
    await expect(service.changePin('u1', 'anything', '5678')).rejects.toThrow(
      /not configured/i,
    );
  });

  it('requires current personal PIN when changing an existing one', async () => {
    users.findOneByOrFail.mockResolvedValue({
      id: 'u1',
      safeActionPinHash: 'hash',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(
      service.changePin('u1', undefined, '5678'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.changePin('u1', 'bad', '5678')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('next');
    await service.changePin('u1', '1234', '9999');
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({ safeActionPinHash: 'next' }),
    );
  });

  it('rejects short new PINs', async () => {
    users.findOneByOrFail.mockResolvedValue({
      id: 'u1',
      safeActionPinHash: null,
    });
    await expect(service.changePin('u1', 'plant', '12')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
