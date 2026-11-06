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

  it('verifies personal hash when set', async () => {
    users.findOneBy.mockResolvedValue({
      id: 'u1',
      safeActionPinHash: 'hash',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    await expect(service.verify('u1', '1234')).resolves.toBe(true);
    expect(bcrypt.compare).toHaveBeenCalledWith('1234', 'hash');
  });

  it('sets a new pin without current when none configured', async () => {
    users.findOneByOrFail.mockResolvedValue({
      id: 'u1',
      safeActionPinHash: null,
    });
    (bcrypt.hash as jest.Mock).mockResolvedValue('newhash');
    await service.changePin('u1', undefined, '5678');
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({ safeActionPinHash: 'newhash' }),
    );
  });
});
