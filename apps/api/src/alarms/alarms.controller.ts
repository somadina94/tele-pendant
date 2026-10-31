import {
  Inject,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuth } from '../common/swagger/api-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/providers/jwt-auth.guard';
import { RolesGuard } from '../auth/providers/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { AlarmEngineService } from './providers/alarm-engine.service';

@ApiTags('alarms')
@Controller('alarms')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class AlarmsController {
  constructor(
    @Inject(AlarmEngineService) private readonly alarms: AlarmEngineService,
  ) {}

  @Get()
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'List active/acked/shelved alarms' })
  list() {
    return this.alarms.listActive();
  }

  @Post(':id/ack')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Acknowledge alarm' })
  ack(@Param('id') id: string) {
    return this.alarms.ack(id);
  }

  @Post(':id/shelve')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Shelve alarm' })
  shelve(@Param('id') id: string) {
    return this.alarms.shelve(id);
  }
}
