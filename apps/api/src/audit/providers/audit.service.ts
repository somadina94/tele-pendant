import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';

export interface WriteAuditInput {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  resource?: string | null;
  details?: string | null;
  ip?: string | null;
  result?: string;
}

@Injectable()
export class AuditService {
  private readonly auditRepository: Repository<AuditLog>;

  constructor(
    @InjectRepository(AuditLog) auditRepository: Repository<AuditLog>,
  ) {
    this.auditRepository = auditRepository;
  }

  async write(input: WriteAuditInput): Promise<AuditLog> {
    const entry = this.auditRepository.create({
      userId: input.userId ?? null,
      userEmail: input.userEmail ?? null,
      action: input.action,
      resource: input.resource ?? null,
      details: input.details ?? null,
      ip: input.ip ?? null,
      result: input.result ?? 'success',
    });
    return this.auditRepository.save(entry);
  }

  async list(limit = 50): Promise<AuditLog[]> {
    return this.auditRepository.find({
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }
}
