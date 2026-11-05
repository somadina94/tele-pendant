import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, CursorAgentError } from '@cursor/sdk';
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { basename, isAbsolute, join, resolve } from 'path';

export interface AssistantHit {
  title: string;
  snippet: string;
  path: string;
  score: number;
}

export interface AssistantSettings {
  docsRoot: string;
  docsLink: string;
  indexed: number;
  cursorConfigured: boolean;
}

const DEFAULT_DOCS_ROOT = 'docs';
const FALLBACK_HANDBOOK = `Tele-Pendant advisory handbook: NxM cells with PLC registers; deadman for motion; safe-action PIN for e-stop; Modbus loss clears motion and writes safe-state; alarms/trends/diagnostics on Ops; camera/QR/voice on Media; face login is local challenge liveness (not ISO; never for e-stop); Config for PLC/registers/cells; Audit logs actions; OTA for mobile JS; assistant default is local FTS. Never issue PLC or safety commands.`;

/**
 * Document assistant: SQLite FTS5 retrieval + optional Cursor Agent synthesis.
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
      CREATE TABLE IF NOT EXISTS assistant_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    if (!this.readSetting('docsRoot')) {
      this.writeSetting('docsRoot', DEFAULT_DOCS_ROOT);
    }
    if (this.readSetting('docsLink') === null) {
      this.writeSetting('docsLink', '');
    }
    const count = this.indexedCount();
    if (count === 0) {
      this.reindex();
    }
  }

  getSettings(): AssistantSettings {
    return {
      docsRoot: this.readSetting('docsRoot') || DEFAULT_DOCS_ROOT,
      docsLink: this.readSetting('docsLink') || '',
      indexed: this.indexedCount(),
      cursorConfigured: Boolean(this.cursorApiKey()),
    };
  }

  updateSettings(input: {
    docsRoot: string;
    docsLink?: string;
  }): AssistantSettings {
    const nextRoot = input.docsRoot.trim() || DEFAULT_DOCS_ROOT;
    const prevRoot = this.readSetting('docsRoot') || DEFAULT_DOCS_ROOT;
    this.writeSetting('docsRoot', nextRoot);
    if (input.docsLink !== undefined) {
      this.writeSetting('docsLink', input.docsLink.trim());
    }
    if (nextRoot !== prevRoot) {
      this.reindex();
    }
    return this.getSettings();
  }

  reindex(): { indexed: number } {
    this.db.exec('DELETE FROM docs_fts');
    const insert = this.db.prepare(
      'INSERT INTO docs_fts (title, body, path) VALUES (?, ?, ?)',
    );
    let indexed = 0;

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

    const docsRoot = this.resolveDocsRoot();
    const markdownFiles = this.listMarkdownDocs(docsRoot);

    const tx = this.db.transaction(() => {
      // Prefer real manuals when present; seed snippets only as offline fallback.
      if (markdownFiles.length === 0) {
        for (const s of seedSnippets) {
          insert.run(s.title, s.body, s.path);
          indexed += 1;
        }
      } else {
        for (const full of markdownFiles) {
          const body = readFileSync(full, 'utf8');
          insert.run(basename(full), body, full);
          indexed += 1;
        }
      }
    });
    tx();
    this.logger.log(
      `Assistant FTS indexed ${indexed} documents from ${docsRoot || '(missing docs root)'}`,
    );
    return { indexed };
  }

  private listMarkdownDocs(docsRoot: string | null): string[] {
    if (
      !docsRoot ||
      !existsSync(docsRoot) ||
      !statSync(docsRoot).isDirectory()
    ) {
      return [];
    }
    return readdirSync(docsRoot)
      .filter((file) => file.endsWith('.md'))
      .map((file) => join(docsRoot, file))
      .filter((full) => statSync(full).isFile());
  }

  search(query: string, limit = 5): AssistantHit[] {
    const q = query.trim();
    if (!q) return [];
    const safe = q.replace(/[^a-zA-Z0-9\s-]/g, ' ').trim();
    if (!safe) return [];
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

  async ask(question: string) {
    const hits = this.search(question, 5);
    const ftsAnswer =
      hits.length === 0
        ? 'No local documents matched. Try words like deadman, e-stop, Modbus, alarm, or PLC wiring.'
        : hits.map((h) => `• ${h.title}: ${h.snippet}`).join('\n');
    const ftsPayload = {
      question,
      answer: ftsAnswer,
      hits,
      mode: 'local-fts' as const,
      note: 'Answers are from the local manuals.',
    };

    const apiKey = this.cursorApiKey();
    if (!apiKey) {
      return ftsPayload;
    }

    try {
      const prompt = this.buildPrompt(question, hits);
      const cwd = this.agentCwd();
      const model =
        this.configService.get<string>('appConfig.cursor.model') ||
        'composer-2.5';
      const result = await Agent.prompt(prompt, {
        apiKey,
        model: { id: model },
        local: { cwd },
      });
      if (result.status === 'error' || !result.result?.trim()) {
        this.logger.warn(`Cursor ask failed status=${result.status}`);
        return {
          ...ftsPayload,
          note: 'Cursor Agent run failed — showing local FTS answer.',
        };
      }
      return {
        question,
        answer: this.toPlainAnswer(result.result),
        hits,
        mode: 'cursor' as const,
        note: 'Answered by Cursor Agent with local manuals + feature handbook.',
      };
    } catch (err) {
      const message =
        err instanceof CursorAgentError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'unknown';
      this.logger.warn(`Cursor ask error: ${message}`);
      return {
        ...ftsPayload,
        note: `Cursor unavailable (${message}) — showing local FTS answer.`,
      };
    }
  }

  private toPlainAnswer(raw: string): string {
    return raw.replace(/\*/g, '').trim();
  }

  private buildPrompt(question: string, hits: AssistantHit[]): string {
    const handbook = this.loadHandbook();
    const docsBlock =
      hits.length === 0
        ? '(no FTS hits)'
        : hits
            .map(
              (h) => `### ${h.title}\npath: ${h.path}\nsnippet: ${h.snippet}`,
            )
            .join('\n\n');
    return [
      'You are the Tele-Pendant operator assistant.',
      'Answer using the feature handbook and retrieved manual snippets.',
      'Be concise. Advisory only — never tell the operator to bypass safety or invent PLC addresses.',
      'If unsure, say what to check in Config/Ops/manuals.',
      'Reply in plain text only: no markdown, no asterisks, no bold, no bullet markers like * or **.',
      'Do not add a footer, signature, or source note.',
      '',
      '## Feature handbook',
      handbook,
      '',
      '## Retrieved documents',
      docsBlock,
      '',
      '## Operator question',
      question,
    ].join('\n');
  }

  private loadHandbook(): string {
    const roots = [this.agentCwd(), this.resolveDocsRoot()].filter(
      (value): value is string => Boolean(value),
    );
    for (const root of roots) {
      for (const path of [
        join(root, 'ASSISTANT_CONTEXT.md'),
        join(root, 'docs', 'ASSISTANT_CONTEXT.md'),
      ]) {
        if (existsSync(path)) {
          return readFileSync(path, 'utf8');
        }
      }
    }
    return FALLBACK_HANDBOOK;
  }

  private resolveDocsRoot(): string | null {
    const configured = this.readSetting('docsRoot') || DEFAULT_DOCS_ROOT;
    if (isAbsolute(configured)) {
      return existsSync(configured) ? configured : null;
    }
    const cwd = process.cwd();
    const candidates = [
      join(cwd, configured),
      join(cwd, '..', configured),
      join(cwd, '..', '..', configured),
      join(cwd, 'src', '..', '..', '..', configured),
      // Docker / monorepo layouts: /app/apps/api → /app/docs
      join(cwd, '..', '..', '..', configured),
      '/app/docs',
    ];
    // Prefer the candidate with the most markdown manuals (avoid sparse
    // apps/api/docs stubs winning over the repo docs/ folder).
    let best: string | null = null;
    let bestCount = -1;
    for (const root of candidates) {
      if (!existsSync(root) || !statSync(root).isDirectory()) continue;
      const count = this.listMarkdownDocs(root).length;
      if (count > bestCount) {
        best = root;
        bestCount = count;
      }
    }
    return best;
  }

  private agentCwd(): string {
    const configured =
      this.configService.get<string>('appConfig.cursor.agentCwd') || '';
    if (configured && existsSync(configured)) {
      return resolve(configured);
    }
    const docsRoot = this.resolveDocsRoot();
    if (docsRoot) {
      return resolve(docsRoot, '..');
    }
    return process.cwd();
  }

  private cursorApiKey(): string {
    return (
      this.configService.get<string>('appConfig.cursor.apiKey') ||
      process.env.CURSOR_API_KEY?.trim() ||
      ''
    );
  }

  private indexedCount(): number {
    return (
      this.db.prepare('SELECT count(*) AS c FROM docs_fts').get() as {
        c: number;
      }
    ).c;
  }

  private readSetting(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM assistant_settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  private writeSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO assistant_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }
}
