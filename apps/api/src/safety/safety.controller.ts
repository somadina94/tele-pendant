import {
  Inject,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiAuth } from '../common/swagger/api-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/providers/jwt-auth.guard';
import { RolesGuard } from '../auth/providers/roles.guard';
import { JwtPayload } from '../auth/providers/auth.service';
import { UserRole } from '../users/enums/user-role.enum';
import { auditActorFromRequest } from '../common/audit-actor';
import { SafetyStateService } from './providers/safety-state.service';
import {
  ResetEStopDto,
  SaveSafetyRolesDto,
} from './dtos/save-safety-roles.dto';

@ApiTags('safety')
@Controller('safety')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class SafetyController {
  constructor(
    @Inject(SafetyStateService)
    private readonly safetyState: SafetyStateService,
  ) {}

  @Get()
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Current software safety snapshot' })
  get() {
    return this.safetyState.snapshot();
  }

  @Get('roles')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Registers bound to E-stop, deadman, heartbeat, safe-state',
  })
  roles() {
    return this.safetyState.getRoles();
  }

  @Put('roles')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Bind safety roles to registers' })
  saveRoles(@Body() body: SaveSafetyRolesDto) {
    return this.safetyState.saveRoles(body);
  }

  @Post('deadman/pulse')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Pulse deadman hold (also available over WS)' })
  pulse() {
    this.safetyState.pulseDeadman();
    return this.safetyState.snapshot();
  }

  @Post('reset')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Reset e-stop. Requires the signed-in user reset PIN (personal or plant fallback).',
  })
  reset(
    @Body() body: ResetEStopDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const actor = auditActorFromRequest(req.user, req.ip);
    return this.safetyState.resetEStop(body.pin ?? '', actor);
  }

  @Post('deadman/release')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Release deadman' })
  release() {
    this.safetyState.releaseDeadman();
    return this.safetyState.snapshot();
  }
}
