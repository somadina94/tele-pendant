import { AssistantService } from './assistant.service';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('AssistantService', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tp-fts-'));
  const docsDir = join(dir, 'docs');
  const configService = {
    get: jest.fn().mockReturnValue(join(dir, 'tele.sqlite')),
  };
  let service: AssistantService;
  let prevCwd: string;

  beforeAll(() => {
    prevCwd = process.cwd();
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'tip.md'), 'deadman hold tip');
    writeFileSync(join(docsDir, 'skip.bin'), 'not markdown');
    process.chdir(dir);
    service = new AssistantService(configService as never);
    service.onModuleInit();
  });

  afterAll(() => {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds deadman guidance', () => {
    const result = service.ask('How does deadman work?');
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.mode).toBe('local-fts');
    expect(result.answer.toLowerCase()).toContain('deadman');
  });

  it('returns empty for blank / punctuation-only queries', () => {
    expect(service.search('')).toEqual([]);
    expect(service.search('   ')).toEqual([]);
    expect(service.search('???')).toEqual([]);
  });

  it('answers with fallback when nothing matches', () => {
    const result = service.ask('xyzzynonexistenttoken123');
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
});
