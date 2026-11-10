import { HmiSeedService } from './hmi-seed.service';

describe('HmiSeedService', () => {
  function makeService(overrides?: {
    cellCount?: number;
    selectorCount?: number;
    activeBg?: { name: string; active: boolean } | null;
  }) {
    const cellCount = overrides?.cellCount ?? 0;
    const selectorCount = overrides?.selectorCount ?? 0;
    const activeBg = overrides?.activeBg ?? null;

    const cells = {
      count: jest.fn().mockResolvedValue(cellCount),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(selectorCount),
        delete: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      })),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (row: unknown) => row),
      create: jest.fn((row: unknown) => row),
    };
    const backgrounds = {
      findOne: jest.fn().mockResolvedValue(activeBg),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(async (row: unknown) => row),
      create: jest.fn((row: unknown) => row),
    };
    const registers = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (row: unknown) => ({
        id: 'reg',
        ...(row as object),
      })),
      create: jest.fn((row: unknown) => row),
    };
    const overlays = {
      createQueryBuilder: jest.fn(() => ({
        delete: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      })),
      save: jest.fn(),
      create: jest.fn((row: unknown) => row),
    };
    const roles = {
      find: jest.fn().mockResolvedValue([{ id: 'role1' }]),
      save: jest.fn(),
      create: jest.fn((row: unknown) => row),
    };

    const service = new HmiSeedService(
      registers as never,
      cells as never,
      backgrounds as never,
      overlays as never,
      roles as never,
    );
    return { service, cells, backgrounds, overlays };
  }

  it('seeds when the database has no cells', async () => {
    const { service, cells } = makeService({ cellCount: 0 });
    const seed = jest.spyOn(service, 'seed').mockResolvedValue(undefined);
    await service.onModuleInit();
    expect(seed).toHaveBeenCalled();
    expect(cells.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('skips migration when selector cells already exist', async () => {
    const { service } = makeService({
      cellCount: 12,
      selectorCount: 3,
      activeBg: { name: 'demo-crane', active: true },
    });
    const reset = jest
      .spyOn(service, 'resetP03a21Demo')
      .mockResolvedValue({ ok: true, cells: 12 });
    await service.onModuleInit();
    expect(reset).not.toHaveBeenCalled();
  });

  it('skips migration when the active background is already P03A21', async () => {
    const { service } = makeService({
      cellCount: 12,
      selectorCount: 0,
      activeBg: { name: 'demo-p03a21', active: true },
    });
    const reset = jest
      .spyOn(service, 'resetP03a21Demo')
      .mockResolvedValue({ ok: true, cells: 12 });
    await service.onModuleInit();
    expect(reset).not.toHaveBeenCalled();
  });

  it('renames shortened P03A21 labels and leaves custom names', async () => {
    const { service, cells } = makeService({
      cellCount: 12,
      selectorCount: 3,
      activeBg: { name: 'demo-p03a21', active: true },
    });
    const shortened = { id: 'a', label: 'OWHA back/fwd' };
    const custom = { id: 'b', label: 'My custom jog' };
    cells.find.mockResolvedValue([shortened, custom]);
    await service.onModuleInit();
    expect(shortened.label).toBe('OWHA backw./forw.');
    expect(custom.label).toBe('My custom jog');
    expect(cells.save).toHaveBeenCalledTimes(1);
    expect(cells.save).toHaveBeenCalledWith(shortened);
  });

  it('migrates legacy crane layouts to P03A21 on boot', async () => {
    const { service } = makeService({
      cellCount: 12,
      selectorCount: 0,
      activeBg: { name: 'demo-crane', active: true },
    });
    const reset = jest
      .spyOn(service, 'resetP03a21Demo')
      .mockResolvedValue({ ok: true, cells: 20 });
    await service.onModuleInit();
    expect(reset).toHaveBeenCalled();
  });
});
