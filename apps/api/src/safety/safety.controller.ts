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
import { SkipThrottle } from '@nestjs/throttler';
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
import { StealControlDto } from './dtos/steal-control.dto';

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
  get(@Req() req: Request & { user: JwtPayload }) {
    return this.safetyState.snapshot(req.user.sub);
  }

  @Get('control')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Exclusive Operator control lease status (FEAT-A5)',
  })
  control(@Req() req: Request & { user: JwtPayload }) {
    return this.safetyState.controlSnapshot(req.user.sub);
  }

  @Post('control/claim')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Claim exclusive control when free (FEAT-A5)',
  })
  claimControl(@Req() req: Request & { user: JwtPayload }) {
    const actor = auditActorFromRequest(req.user, req.ip);
    return this.safetyState.claimControl(
      req.user.sub,
      req.user.displayName || req.user.email,
      actor,
    );
  }

  @Post('control/heartbeat')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Keep exclusive control alive while Operator is open (FEAT-A5)',
  })
  heartbeatControl(@Req() req: Request & { user: JwtPayload }) {
    return this.safetyState.heartbeatControl(req.user.sub);
  }

  @Post('control/release')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Release exclusive control (FEAT-A5)' })
  releaseControl(@Req() req: Request & { user: JwtPayload }) {
    const actor = auditActorFromRequest(req.user, req.ip);
    return this.safetyState.releaseControl(req.user.sub, actor);
  }

  @Post('control/steal')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Steal exclusive control with reset PIN confirmation (FEAT-A5)',
  })
  stealControl(
    @Body() body: StealControlDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const actor = auditActorFromRequest(req.user, req.ip);
    return this.safetyState.stealControl(
      body.pin ?? '',
      req.user.sub,
      req.user.displayName || req.user.email,
      actor,
    );
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
  @ApiOperation({
    summary:
      'Bind safety roles to registers (requires reset PIN; audited — TP-42)',
  })
  saveRoles(
    @Body() body: SaveSafetyRolesDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const actor = auditActorFromRequest(req.user, req.ip);
    return this.safetyState.saveRoles(body, actor);
  }

  @Post('deadman/pulse')
  @SkipThrottle()
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Pulse deadman hold (also available over WS)' })
  pulse(@Req() req: Request & { user: JwtPayload }) {
    this.safetyState.pulseDeadman({ userId: req.user.sub });
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
  @ApiOperation({
    summary: 'Release deadman (also clears PLC deadman and motion coils)',
  })
  release(@Req() req: Request & { user: JwtPayload }) {
    return this.safetyState.releaseDeadman({ userId: req.user.sub });
  }
}
