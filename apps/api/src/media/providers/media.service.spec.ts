import { NotFoundException } from '@nestjs/common';
import { MediaService } from './media.service';
import { UserRole } from '../../users/enums/user-role.enum';

describe('MediaService', () => {
  const codes = {
    count: jest.fn().mockResolvedValue(1),
    find: jest.fn().mockResolvedValue([{ code: 'TP-OPS' }]),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((x) => x),
  };
  const hmiService = {
    getLayout: jest.fn().mockResolvedValue({
      cells: [
        {
          id: 'c1',
          label: 'Hoist Up',
          isMotion: true,
          requiresSafeAction: false,
        },
        {
          id: 'stop',
          label: 'STOP',
          isMotion: false,
          requiresSafeAction: true,
        },
      ],
    }),
    activateCell: jest.fn().mockResolvedValue({ ok: true }),
  };
  const safetyState = { pulseDeadman: jest.fn() };
  const auditService = { write: jest.fn().mockResolvedValue({}) };

  let service: MediaService;
  const prevRtsp = process.env.CAMERA_RTSP_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    codes.count.mockResolvedValue(1);
    hmiService.getLayout.mockResolvedValue({
      cells: [
        {
          id: 'c1',
          label: 'Hoist Up',
          isMotion: true,
          requiresSafeAction: false,
        },
        {
          id: 'stop',
          label: 'STOP',
          isMotion: false,
          requiresSafeAction: true,
        },
      ],
    });
    delete process.env.CAMERA_RTSP_URL;
    service = new MediaService(
      codes as never,
      hmiService as never,
      safetyState as never,
      auditService as never,
    );
  });

  afterAll(() => {
    if (prevRtsp === undefined) delete process.env.CAMERA_RTSP_URL;
    else process.env.CAMERA_RTSP_URL = prevRtsp;
  });

  it('seeds QR codes when empty and skips when present', async () => {
    await service.onModuleInit();
    expect(codes.save).not.toHaveBeenCalled();
    codes.count.mockResolvedValue(0);
    await service.onModuleInit();
    expect(codes.save).toHaveBeenCalled();
  });

  it('resolves known codes and lists them', async () => {
    codes.findOne.mockResolvedValue({ code: 'TP-CRANE-DEMO-01' });
    await expect(service.resolveCode('  TP-CRANE-DEMO-01  ')).resolves.toEqual(
      expect.objectContaining({ code: 'TP-CRANE-DEMO-01' }),
    );
    codes.findOne.mockResolvedValue(null);
    await expect(service.resolveCode('NOPE')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await service.listCodes()).toHaveLength(1);
  });

  it('rejects unknown voice commands', async () => {
    const result = await service.voiceCommand('dance party', {
      role: UserRole.OPERATOR,
    });
    expect(result.ok).toBe(false);
  });

  it('maps exact and fuzzy voice aliases', async () => {
    const exact = await service.voiceCommand('hoist up', {
      role: UserRole.OPERATOR,
      userEmail: 'op@example.com',
    });
    expect(exact.ok).toBe(true);
    expect(safetyState.pulseDeadman).toHaveBeenCalled();

    safetyState.pulseDeadman.mockClear();
    const fuzzy = await service.voiceCommand('please hoist up now', {
      role: UserRole.OPERATOR,
    });
    expect(fuzzy.ok).toBe(true);

    safetyState.pulseDeadman.mockClear();
    const stop = await service.voiceCommand('emergency stop', {
      role: UserRole.SUPERVISOR,
      safeActionPin: '1234',
    });
    expect(stop.ok).toBe(true);
    expect(safetyState.pulseDeadman).not.toHaveBeenCalled();
  });

  it('returns cell_not_found when label missing from layout', async () => {
    hmiService.getLayout.mockResolvedValueOnce({ cells: [] });
    const result = await service.voiceCommand('stop', {
      role: UserRole.SUPERVISOR,
    });
    expect(result).toEqual(
      expect.objectContaining({ ok: false, reason: 'cell_not_found' }),
    );
  });

  it('exposes camera config with and without RTSP', () => {
    expect(service.cameraConfig().rtspUrl).toBeNull();
    process.env.CAMERA_RTSP_URL = 'rtsp://cam/1';
    expect(service.cameraConfig().rtspUrl).toBe('rtsp://cam/1');
    expect(service.cameraConfig().deviceCameraEnabled).toBe(true);
  });
});
