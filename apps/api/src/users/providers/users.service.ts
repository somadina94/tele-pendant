import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Like, Repository } from 'typeorm';
import { AuditService } from '../../audit/providers/audit.service';
import { AuditActor, auditWriteFields } from '../../common/audit-actor';
import { CreateUserDto } from '../dtos/create-user.dto';
import { UpdateUserDto } from '../dtos/update-user.dto';
import { UserRole } from '../enums/user-role.enum';
import { User } from '../entities/user.entity';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly usersRepository: Repository<User>;
  private readonly auditService: AuditService;

  constructor(
    @InjectRepository(User) usersRepository: Repository<User>,
    @Inject(AuditService) auditService: AuditService,
  ) {
    this.usersRepository = usersRepository;
    this.auditService = auditService;
  }

  /** TP-33: repair seeded/demo display names that used “Opertaor”. */
  async onModuleInit(): Promise<void> {
    const rows = await this.usersRepository.find({
      where: { displayName: Like('%Opertaor%') },
    });
    for (const row of rows) {
      if (!row.displayName?.includes('Opertaor')) continue;
      row.displayName = row.displayName.replaceAll('Opertaor', 'Operator');
      await this.usersRepository.save(row);
    }
  }

  toPublicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName ?? null,
      locale: user.locale,
      localePinned: user.localePinned === true,
      hasFaceTemplate: Boolean(user.faceTemplate),
      hasSafeActionPin: Boolean(user.safeActionPinHash),
      suspended: user.suspended === true,
    };
  }

  private assertAdminCanManage(target: User, actor: AuditActor) {
    if (target.id === actor.userId) {
      throw new ForbiddenException('Use account settings for your own profile');
    }
    if (target.role === UserRole.ADMIN) {
      throw new ForbiddenException('Admin accounts cannot be changed here');
    }
  }

  async list() {
    const rows = await this.usersRepository.find({ order: { email: 'ASC' } });
    return rows.map((row) => this.toPublicUser(row));
  }

  async create(dto: CreateUserDto, actor: AuditActor) {
    const email = dto.email.trim().toLowerCase();
    const displayName = dto.displayName.trim();
    if (!displayName) {
      throw new BadRequestException('Display name is required');
    }
    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const saved = await this.usersRepository.save(
      this.usersRepository.create({
        email,
        passwordHash,
        displayName,
        role: dto.role,
      }),
    );
    await this.auditService.write({
      ...auditWriteFields(actor),
      action: 'users.create',
      resource: saved.email,
      details: `${saved.displayName};role=${saved.role}`,
      result: 'success',
    });
    return this.toPublicUser(saved);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuditActor) {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    this.assertAdminCanManage(user, actor);

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const taken = await this.usersRepository.findOne({ where: { email } });
      if (taken && taken.id !== user.id) {
        throw new ConflictException('Email already registered');
      }
      user.email = email;
    }
    if (dto.displayName !== undefined) {
      const displayName = dto.displayName.trim();
      if (!displayName) {
        throw new BadRequestException('Display name is required');
      }
      user.displayName = displayName;
    }
    if (dto.role !== undefined) user.role = dto.role;
    const wasSuspended = user.suspended === true;
    if (dto.suspended !== undefined) user.suspended = dto.suspended;
    if (dto.password !== undefined) {
      user.passwordHash = await bcrypt.hash(dto.password, 12);
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    } else if (dto.suspended === true && !wasSuspended) {
      // TP-40: suspending must kill outstanding JWTs immediately.
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }

    const saved = await this.usersRepository.save(user);
    await this.auditService.write({
      ...auditWriteFields(actor),
      action: 'users.update',
      resource: saved.email,
      details: `role=${saved.role};suspended=${saved.suspended}`,
      result: 'success',
    });
    return this.toPublicUser(saved);
  }

  async remove(id: string, actor: AuditActor) {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    this.assertAdminCanManage(user, actor);
    await this.usersRepository.remove(user);
    await this.auditService.write({
      ...auditWriteFields(actor),
      action: 'users.delete',
      resource: user.email,
      details: user.displayName ?? undefined,
      result: 'success',
    });
    return { ok: true };
  }
}
