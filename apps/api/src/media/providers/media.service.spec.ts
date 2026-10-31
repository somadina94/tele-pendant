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
  const safetyState = {
    pulseDeadman: jest.fn(),
    releaseDeadman: jest.fn(),
  };
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

  afterEach(() => {
    const timer = (service as unknown as { motionJog: NodeJS.Timeout | null })
      .motionJog;
    if (timer) clearInterval(timer);
    jest.useRealTimers();
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

  it('uses a later alternative when the top transcript misses', async () => {
    const result = await service.voiceCommand('banana', {
      role: UserRole.OPERATOR,
      alternatives: ['completely wrong', 'hoist up'],
    });
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        label: 'Hoist Up',
        transcript: 'hoist up',
      }),
    );
  });

  it('rejects a blank transcript', async () => {
    const result = await service.voiceCommand('   ', {
      role: UserRole.OPERATOR,
    });
    expect(result).toEqual(
      expect.objectContaining({ ok: false, reason: 'command_not_allowlisted' }),
    );
  });

  it('jogs hoist up then clears the coil', async () => {
    jest.useFakeTimers();
    const result = await service.voiceCommand('hoist down', {
      role: UserRole.OPERATOR,
    });
    expect(result.ok).toBe(false);

    hmiService.getLayout.mockResolvedValueOnce({
      cells: [
        {
          id: 'down',
          label: 'Hoist Down',
          isMotion: true,
          requiresSafeAction: false,
        },
      ],
    });
    const down = await service.voiceCommand('down', {
      role: UserRole.OPERATOR,
    });
    expect(down).toEqual(
      expect.objectContaining({ ok: true, label: 'Hoist Down' }),
    );
    await jest.advanceTimersByTimeAsync(2800);
    expect(hmiService.activateCell).toHaveBeenCalledWith('down', false, {});
    expect(safetyState.releaseDeadman).toHaveBeenCalled();
  });

  it('still releases deadman if clearing the coil fails', async () => {
    jest.useFakeTimers();
    hmiService.activateCell.mockImplementation(
      (_id: string, value: boolean) => {
        if (!value) return Promise.reject(new Error('clear failed'));
        return Promise.resolve({ ok: true });
      },
    );
    await service.voiceCommand('hoist up', { role: UserRole.OPERATOR });
    await service.voiceCommand('hoist up', { role: UserRole.OPERATOR });
    await jest.advanceTimersByTimeAsync(2800);
    expect(safetyState.releaseDeadman).toHaveBeenCalled();
  });

  it('clears the opposite hoist coil and ignores a non-hoist motion cell', async () => {
    hmiService.getLayout.mockResolvedValue({
      cells: [
        { id: 'up', label: 'Hoist Up', isMotion: true },
        { id: 'down', label: 'Hoist Down', isMotion: true },
        { id: 'left', label: 'Trolley L', isMotion: true },
      ],
    });
    await service.voiceCommand('down', { role: UserRole.OPERATOR });
    expect(hmiService.activateCell).toHaveBeenCalledWith(
      'up',
      false,
      expect.any(Object),
    );
    expect(hmiService.activateCell).toHaveBeenCalledWith(
      'down',
      true,
      expect.any(Object),
    );

    hmiService.activateCell.mockImplementation(
      (_id: string, value: boolean) => {
        if (!value) return Promise.reject(new Error('clear'));
        return Promise.resolve({ ok: true });
      },
    );
    await service.voiceCommand('up', { role: UserRole.OPERATOR });
    await service.voiceCommand('trolley left', { role: UserRole.OPERATOR });
    expect(hmiService.activateCell).toHaveBeenCalledWith(
      'left',
      true,
      expect.any(Object),
    );
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
