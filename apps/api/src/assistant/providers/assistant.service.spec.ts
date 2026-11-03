import { AssistantService } from './assistant.service';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  realpathSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

jest.mock('@cursor/sdk', () => ({
  Agent: {
    prompt: jest.fn(),
  },
  CursorAgentError: class CursorAgentError extends Error {
    isRetryable = false;
  },
}));

import { Agent, CursorAgentError } from '@cursor/sdk';

describe('AssistantService', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tp-fts-'));
  const docsDir = join(dir, 'docs');
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'database.path') return join(dir, 'tele.sqlite');
      if (key === 'appConfig.cursor.apiKey') return '';
      if (key === 'appConfig.cursor.agentCwd') return dir;
      if (key === 'appConfig.cursor.model') return 'composer-2.5';
      return undefined;
    }),
  };
  let service: AssistantService;
  let prevCwd: string;

  beforeAll(() => {
    prevCwd = process.cwd();
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'tip.md'), 'deadman hold tip');
    writeFileSync(join(docsDir, 'skip.bin'), 'not markdown');
    writeFileSync(
      join(docsDir, 'ASSISTANT_CONTEXT.md'),
      'Handbook deadman context',
    );
    process.chdir(dir);
    service = new AssistantService(configService as never);
    service.onModuleInit();
  });

  afterAll(() => {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    (Agent.prompt as jest.Mock).mockReset();
    configService.get.mockImplementation((key: string) => {
      if (key === 'database.path') return join(dir, 'tele.sqlite');
      if (key === 'appConfig.cursor.apiKey') return '';
      if (key === 'appConfig.cursor.agentCwd') return dir;
      if (key === 'appConfig.cursor.model') return 'auto';
      return undefined;
    });
  });

  it('finds deadman guidance via FTS', async () => {
    const result = await service.ask('How does deadman work?');
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.mode).toBe('local-fts');
    expect(result.answer.toLowerCase()).toContain('deadman');
  });

  it('returns empty for blank / punctuation-only queries', () => {
    expect(service.search('')).toEqual([]);
    expect(service.search('   ')).toEqual([]);
    expect(service.search('???')).toEqual([]);
  });

  it('answers with fallback when nothing matches', async () => {
    const result = await service.ask('xyzzynonexistenttoken123');
    expect(result.hits).toEqual([]);
    expect(result.answer).toMatch(/No local documents matched/);
  });

  it('reindexes without error and skips non-md files', () => {
    const { indexed } = service.reindex();
    expect(indexed).toBeGreaterThan(0);
  });

  it('skips reindex on subsequent init when docs exist', () => {
    service.onModuleInit();
    expect(service.search('deadman').length).toBeGreaterThan(0);
  });

  it('uses default data dir when database.path missing', () => {
    const orphanDir = mkdtempSync(join(tmpdir(), 'tp-fts2-'));
    process.chdir(orphanDir);
    const bare = new AssistantService({
      get: jest.fn().mockReturnValue(undefined),
    } as never);
    bare.onModuleInit();
    expect(bare.search('deadman').length).toBeGreaterThan(0);
    process.chdir(dir);
    rmSync(orphanDir, { recursive: true, force: true });
  });

  it('swallows FTS match errors', () => {
    type PrepareFn = (sql: string) => {
      all: (...args: unknown[]) => unknown[];
    };
    const db = (
      service as unknown as {
        db: { prepare: PrepareFn };
      }
    ).db;
    const original: PrepareFn = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      if (sql.includes('MATCH')) {
        throw new Error('fts boom');
      }
      return original(sql);
    };
    expect(service.search('deadman')).toEqual([]);
    db.prepare = original;
  });

  it('falls back when only stopwords remain', () => {
    const hits = service.search('how');
    expect(Array.isArray(hits)).toBe(true);
  });

  it('reads and updates settings and reindexes on docsRoot change', () => {
    const custom = join(dir, 'custom-docs');
    mkdirSync(custom, { recursive: true });
    writeFileSync(join(custom, 'extra.md'), 'custom shelve tip');
    const before = service.getSettings();
    expect(before.docsRoot).toBe('docs');
    const updated = service.updateSettings({
      docsRoot: custom,
      docsLink: 'https://example.com/manual',
    });
    expect(updated.docsRoot).toBe(custom);
    expect(updated.docsLink).toBe('https://example.com/manual');
    expect(updated.indexed).toBeGreaterThan(0);
    expect(service.search('shelve').length).toBeGreaterThan(0);
    service.updateSettings({ docsRoot: 'docs', docsLink: '' });
  });

  it('uses Cursor Agent when API key is configured', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'database.path') return join(dir, 'tele.sqlite');
      if (key === 'appConfig.cursor.apiKey') return 'cursor_test_key';
      if (key === 'appConfig.cursor.agentCwd') return dir;
      if (key === 'appConfig.cursor.model') return 'auto';
      return undefined;
    });
    (Agent.prompt as jest.Mock).mockResolvedValue({
      status: 'finished',
      result: 'Hold deadman while jogging.',
    });
    const result = await service.ask('How does deadman work?');
    expect(result.mode).toBe('cursor');
    expect(result.answer).toContain('Hold deadman');
    expect((Agent.prompt as jest.Mock).mock.calls[0]?.[1]?.model).toEqual({
      id: 'auto',
    });
  });

  it('falls back to FTS when Cursor returns error status', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'database.path') return join(dir, 'tele.sqlite');
      if (key === 'appConfig.cursor.apiKey') return 'cursor_test_key';
      if (key === 'appConfig.cursor.agentCwd') return dir;
      if (key === 'appConfig.cursor.model') return 'composer-2.5';
      return undefined;
    });
    (Agent.prompt as jest.Mock).mockResolvedValue({
      status: 'error',
      result: '',
    });
    const result = await service.ask('How does deadman work?');
    expect(result.mode).toBe('local-fts');
    expect(result.note).toMatch(/failed/i);
  });

  it('falls back to FTS when Cursor throws', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'database.path') return join(dir, 'tele.sqlite');
      if (key === 'appConfig.cursor.apiKey') return 'cursor_test_key';
      if (key === 'appConfig.cursor.agentCwd') return dir;
      if (key === 'appConfig.cursor.model') return 'composer-2.5';
      return undefined;
    });
    (Agent.prompt as jest.Mock).mockRejectedValue(
      new CursorAgentError('auth failed'),
    );
    const result = await service.ask('How does deadman work?');
    expect(result.mode).toBe('local-fts');
    expect(result.note).toMatch(/unavailable/i);
  });

  it('falls back when Cursor throws a plain Error', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'database.path') return join(dir, 'tele.sqlite');
      if (key === 'appConfig.cursor.apiKey') return 'cursor_test_key';
      if (key === 'appConfig.cursor.agentCwd') return dir;
      if (key === 'appConfig.cursor.model') return 'composer-2.5';
      return undefined;
    });
    (Agent.prompt as jest.Mock).mockRejectedValue(new Error('network'));
    const result = await service.ask('deadman');
    expect(result.mode).toBe('local-fts');
  });

  it('falls back when Cursor throws a non-Error', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'database.path') return join(dir, 'tele.sqlite');
      if (key === 'appConfig.cursor.apiKey') return 'cursor_test_key';
      if (key === 'appConfig.cursor.agentCwd') return dir;
      if (key === 'appConfig.cursor.model') return 'composer-2.5';
      return undefined;
    });
    (Agent.prompt as jest.Mock).mockRejectedValue('boom');
    const result = await service.ask('deadman');
    expect(result.mode).toBe('local-fts');
  });

  it('uses fallback handbook and cwd when agent cwd is missing', async () => {
    const handbook = join(docsDir, 'ASSISTANT_CONTEXT.md');
    renameSync(handbook, `${handbook}.bak`);
    configService.get.mockImplementation((key: string) => {
      if (key === 'database.path') return join(dir, 'tele.sqlite');
      if (key === 'appConfig.cursor.apiKey') return 'cursor_test_key';
      if (key === 'appConfig.cursor.agentCwd') return join(dir, 'missing-cwd');
      if (key === 'appConfig.cursor.model') return '';
      return undefined;
    });
    (Agent.prompt as jest.Mock).mockResolvedValue({
      status: 'finished',
      result: '  ok from fallback handbook  ',
    });
    const result = await service.ask('deadman');
    expect(result.mode).toBe('cursor');
    expect(result.answer).toBe('ok from fallback handbook');
    const prompt = (Agent.prompt as jest.Mock).mock.calls[0][0] as string;
    expect(prompt).toMatch(/Advisory only|NxM cells/i);
    renameSync(`${handbook}.bak`, handbook);
  });

  it('handles blank docsRoot, missing absolute root, and env API key', async () => {
    const settings = service.updateSettings({ docsRoot: '   ' });
    expect(settings.docsRoot).toBe('docs');
    service.updateSettings({
      docsRoot: '/definitely/not/a/real/docs/root-xyz',
    });
    const { indexed } = service.reindex();
    expect(indexed).toBe(5);
    service.updateSettings({ docsRoot: 'docs' });

    const prev = process.env.CURSOR_API_KEY;
    process.env.CURSOR_API_KEY = 'env_key';
    configService.get.mockImplementation((key: string) => {
      if (key === 'database.path') return join(dir, 'tele.sqlite');
      if (key === 'appConfig.cursor.apiKey') return '';
      if (key === 'appConfig.cursor.agentCwd') return '';
      if (key === 'appConfig.cursor.model') return 'composer-2.5';
      return undefined;
    });
    (Agent.prompt as jest.Mock).mockResolvedValue({
      status: 'finished',
      result: '   ',
    });
    const blank = await service.ask('deadman');
    expect(blank.mode).toBe('local-fts');
    (Agent.prompt as jest.Mock).mockResolvedValue({
      status: 'finished',
      result: 'from env key',
    });
    const ok = await service.ask('deadman');
    expect(ok.mode).toBe('cursor');
    if (prev === undefined) delete process.env.CURSOR_API_KEY;
    else process.env.CURSOR_API_KEY = prev;
  });

  it('keeps docsLink when omitted and uses process cwd without docs', () => {
    service.updateSettings({
      docsRoot: 'docs',
      docsLink: 'https://keep.example',
    });
    const next = service.updateSettings({ docsRoot: 'docs' });
    expect(next.docsLink).toBe('https://keep.example');

    const empty = mkdtempSync(join(tmpdir(), 'tp-fts-empty-'));
    process.chdir(empty);
    configService.get.mockImplementation((key: string) => {
      if (key === 'database.path') return join(dir, 'tele.sqlite');
      if (key === 'appConfig.cursor.apiKey') return '';
      if (key === 'appConfig.cursor.agentCwd') return join(empty, 'nope');
      return undefined;
    });
    // Clear docsRoot so resolveDocsRoot is null in empty cwd.
    (
      service as unknown as {
        db: { prepare: (sql: string) => { run: (...a: unknown[]) => void } };
      }
    ).db
      .prepare('DELETE FROM assistant_settings WHERE key = ?')
      .run('docsRoot');
    const cwd = (service as unknown as { agentCwd: () => string }).agentCwd();
    expect(realpathSync(cwd)).toBe(realpathSync(empty));
    expect(service.getSettings().docsRoot).toBe('docs');
    process.chdir(dir);
    service.updateSettings({ docsRoot: 'docs' });
    rmSync(empty, { recursive: true, force: true });
  });

  it('builds prompt with empty hits for Cursor', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'database.path') return join(dir, 'tele.sqlite');
      if (key === 'appConfig.cursor.apiKey') return 'cursor_test_key';
      if (key === 'appConfig.cursor.agentCwd') return dir;
      if (key === 'appConfig.cursor.model') return 'composer-2.5';
      return undefined;
    });
    (Agent.prompt as jest.Mock).mockResolvedValue({
      status: 'finished',
      result: 'no docs matched but here is advice',
    });
    const result = await service.ask('xyzzynonexistenttoken123');
    expect(result.mode).toBe('cursor');
    const prompt = (Agent.prompt as jest.Mock).mock.calls[0][0] as string;
    expect(prompt).toContain('(no FTS hits)');
  });
});
