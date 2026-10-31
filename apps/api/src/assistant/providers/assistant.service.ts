import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface AssistantHit {
  title: string;
  snippet: string;
  path: string;
  score: number;
}

/**
 * Local document assistant using SQLite FTS5 — no cloud LLM / no API keys.
 */
@Injectable()
export class AssistantService implements OnModuleInit {
  private readonly logger = new Logger(AssistantService.name);
  private db!: Database.Database;
  private readonly configService: ConfigService;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.configService = configService;
  }

  onModuleInit(): void {
    const dataDir =
      this.configService
        .get<string>('database.path')
        ?.replace(/[^/\\]+$/, '') || join(process.cwd(), 'data');
    mkdirSync(dataDir, { recursive: true });
    const ftsPath = join(dataDir, 'assistant-fts.sqlite');
    this.db = new Database(ftsPath);
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
        title,
        body,
        path,
        tokenize = 'porter'
      );
    `);
    const count = (
      this.db.prepare('SELECT count(*) AS c FROM docs_fts').get() as {
        c: number;
      }
    ).c;
    if (count === 0) {
      this.reindex();
    }
  }

  reindex(): { indexed: number } {
    this.db.exec('DELETE FROM docs_fts');
    const insert = this.db.prepare(
      'INSERT INTO docs_fts (title, body, path) VALUES (?, ?, ?)',
    );
    let indexed = 0;

    const roots = [
      join(process.cwd(), 'docs'),
      join(process.cwd(), '..', '..', 'docs'),
      join(process.cwd(), 'src', '..', '..', '..', 'docs'),
    ];

    const seedSnippets: Array<{ title: string; body: string; path: string }> = [
      {
        title: 'Deadman hold',
        body: 'Motion cells require an active deadman. Hold the control; release stops motion. Software supervision only — not SIL certified.',
        path: 'seed/deadman',
      },
      {
        title: 'E-stop',
        body: 'E-stop cell asserts the e-stop coil and enters e_stop safety mode. Requires safe-action supervisor PIN. Cleared only when coil is low.',
        path: 'seed/estop',
      },
      {
        title: 'Lost communications',
        body: 'If Modbus connection drops, watchdog enters comms_lost, clears motion coils, and writes safe-state register.',
        path: 'seed/comms',
      },
      {
        title: 'Real PLC wiring',
        body: 'Disable simulator connection in admin, add PLC host/port/unitId, map registers in SQLite, bind cells, test safe-state on maintenance window.',
        path: 'seed/plc-wiring',
      },
      {
        title: 'Alarm troubleshooting',
        body: 'Active alarms appear on /ops. Acknowledge after verifying plant state. Shelve only as supervisor. E-Stop asserted alarm tracks coil.eStop.',
        path: 'seed/alarms',
      },
    ];

    const tx = this.db.transaction(() => {
      for (const s of seedSnippets) {
        insert.run(s.title, s.body, s.path);
        indexed += 1;
      }
      for (const root of roots) {
        if (!existsSync(root)) continue;
        for (const file of readdirSync(root)) {
          if (!file.endsWith('.md')) continue;
          const full = join(root, file);
          const body = readFileSync(full, 'utf8');
          insert.run(file, body, full);
          indexed += 1;
        }
      }
    });
    tx();
    this.logger.log(`Assistant FTS indexed ${indexed} documents`);
    return { indexed };
  }

  search(query: string, limit = 5): AssistantHit[] {
    const q = query.trim();
    if (!q) return [];
    const safe = q.replace(/[^a-zA-Z0-9\s-]/g, ' ').trim();
    if (!safe) return [];
    // Natural questions → OR of meaningful tokens (AND would miss seed tips).
    const stop = new Set([
      'how',
      'does',
      'what',
      'the',
      'a',
      'an',
      'is',
      'are',
      'do',
      'to',
      'of',
      'in',
      'on',
      'for',
      'with',
      'and',
      'or',
      'work',
      'works',
      'please',
      'tell',
      'me',
      'about',
    ]);
    const tokens = safe
      .split(/\s+/)
      .map((t) => t.toLowerCase())
      .filter((t) => t.length > 2 && !stop.has(t));
    const matchExpr =
      tokens.length > 0
        ? tokens.map((t) => `"${t}"`).join(' OR ')
        : `"${safe.split(/\s+/)[0]}"`;
    try {
      const rows = this.db
        .prepare(
          `SELECT title, path, snippet(docs_fts, 1, '[', ']', '…', 24) AS snippet,
                  bm25(docs_fts) AS score
           FROM docs_fts
           WHERE docs_fts MATCH ?
           ORDER BY score
           LIMIT ?`,
        )
        .all(matchExpr, limit) as Array<{
        title: string;
        path: string;
        snippet: string;
        score: number;
      }>;
      return rows.map((r) => ({
        title: r.title,
        path: r.path,
        snippet: r.snippet,
        score: r.score,
      }));
    } catch {
      return [];
    }
  }

  ask(question: string) {
    const hits = this.search(question, 5);
    return {
      question,
      answer:
        hits.length === 0
          ? 'No local documents matched. Try words like deadman, e-stop, Modbus, alarm, or PLC wiring.'
          : hits.map((h) => `• ${h.title}: ${h.snippet}`).join('\n'),
      hits,
      mode: 'local-fts' as const,
      note: 'No cloud LLM — retrieval over shipped manuals / seed tips only.',
    };
  }
}
