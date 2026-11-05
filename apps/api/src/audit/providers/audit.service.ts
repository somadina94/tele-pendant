import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ParsedAuditListQuery } from '../dtos/list-audit-query.dto';
import { AuditLog } from '../entities/audit-log.entity';
import { auditLogsToCsv } from './audit-csv';

export interface WriteAuditInput {
  userId?: string | null;
  userEmail?: string | null;
  userDisplayName?: string | null;
  action: string;
  resource?: string | null;
  details?: string | null;
  ip?: string | null;
  result?: string;
}

export interface AuditListResult {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

const EXPORT_MAX_ROWS = 10_000;

@Injectable()
export class AuditService {
  private readonly auditRepository: Repository<AuditLog>;
  private readonly usersRepository: Repository<User>;

  constructor(
    @InjectRepository(AuditLog) auditRepository: Repository<AuditLog>,
    @InjectRepository(User) usersRepository: Repository<User>,
  ) {
    this.auditRepository = auditRepository;
    this.usersRepository = usersRepository;
  }

  async write(input: WriteAuditInput): Promise<AuditLog> {
    const entry = this.auditRepository.create({
      userId: input.userId ?? null,
      userEmail: input.userEmail ?? null,
      userDisplayName: input.userDisplayName ?? null,
      action: input.action,
      resource: input.resource ?? null,
      details: input.details ?? null,
      ip: input.ip ?? null,
      result: input.result ?? 'success',
    });
    return this.auditRepository.save(entry);
  }

  /** @deprecated Prefer {@link query} — kept for older callers/tests. */
  async list(limit = 50): Promise<AuditLog[]> {
    const result = await this.query({
      page: 1,
      pageSize: Math.min(limit, 200),
    });
    return result.items;
  }

  async query(options: ParsedAuditListQuery): Promise<AuditListResult> {
    const qb = this.auditRepository
      .createQueryBuilder('audit')
      .orderBy('audit.created_at', 'DESC');

    if (options.from) {
      qb.andWhere('audit.created_at >= :from', { from: options.from });
    }
    if (options.to) {
      qb.andWhere('audit.created_at <= :to', { to: options.to });
    }
    if (options.user) {
      const term = `%${options.user.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(audit.user_email) LIKE :term OR LOWER(audit.user_display_name) LIKE :term)',
        { term },
      );
    }

    const total = await qb.getCount();
    const page = options.page;
    const pageSize = options.pageSize;
    const items = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    await this.enrichDisplayNames(items);

    return { items, total, page, pageSize };
  }

  async exportCsv(
    options: Omit<ParsedAuditListQuery, 'page' | 'pageSize'>,
  ): Promise<string> {
    const result = await this.query({
      ...options,
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
    });
    return auditLogsToCsv(result.items);
  }

  private async enrichDisplayNames(rows: AuditLog[]): Promise<void> {
    const needName = rows.filter((row) => !row.userDisplayName && row.userId);
    if (needName.length === 0) return;
    const users = await this.usersRepository.find({
      where: { id: In(needName.map((row) => row.userId!)) },
    });
    const names = new Map(
      users.map((user) => [user.id, user.displayName ?? null]),
    );
    for (const row of needName) {
      row.userDisplayName = names.get(row.userId!) ?? null;
    }
  }
}
