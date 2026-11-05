import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiAuth } from '../common/swagger/api-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/providers/auth.service';
import { JwtAuthGuard } from '../auth/providers/jwt-auth.guard';
import { RolesGuard } from '../auth/providers/roles.guard';
import { auditActorFromRequest } from '../common/audit-actor';
import { CreateUserDto } from './dtos/create-user.dto';
import { UserRole } from './enums/user-role.enum';
import { UsersService } from './providers/users.service';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List accounts (admin)' })
  list() {
    return this.users.list();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create an operator or supervisor account' })
  create(
    @Body() dto: CreateUserDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.users.create(dto, auditActorFromRequest(req.user, req.ip));
  }
}
