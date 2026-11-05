import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/providers/audit.service';
import { AuditActor, auditWriteFields } from '../../common/audit-actor';
import { CreateUserDto } from '../dtos/create-user.dto';
import { User } from '../entities/user.entity';

@Injectable()
export class UsersService {
  private readonly usersRepository: Repository<User>;
  private readonly auditService: AuditService;

  constructor(
    @InjectRepository(User) usersRepository: Repository<User>,
    @Inject(AuditService) auditService: AuditService,
  ) {
    this.usersRepository = usersRepository;
    this.auditService = auditService;
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
    };
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
}
