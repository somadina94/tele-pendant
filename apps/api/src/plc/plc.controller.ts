import {
  Inject,
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { auditActorFromRequest, auditWriteFields } from '../common/audit-actor';
import { AuditService } from '../audit/providers/audit.service';
import { UserRole } from '../users/enums/user-role.enum';
import { SavePlcConnectionDto } from './dtos/save-plc-connection.dto';
import { WriteCoilDto } from './dtos/write-coil.dto';
import { WriteHoldingDto } from './dtos/write-holding.dto';
import { PlcService } from './providers/plc.service';

@ApiTags('plc')
@Controller('plc')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class PlcController {
  constructor(
    @Inject(PlcService) private readonly plcService: PlcService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  @Get('health')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Active PLC connection health' })
  health() {
    return this.plcService.health();
  }

  @Get('connections')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'List configured PLC connections' })
  list() {
    return this.plcService.list();
  }

  @Post('connections')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Add a PLC connection' })
  create(@Body() dto: SavePlcConnectionDto) {
    return this.plcService.saveConnection(dto);
  }

  @Patch('connections/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({
    summary: 'Update a PLC connection and connect when it is the one in use',
  })
  update(@Param('id') id: string, @Body() dto: SavePlcConnectionDto) {
    return this.plcService.saveConnection({ ...dto, id });
  }

  @Post('connections/:id/connect')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Connect to a configured PLC (or simulator)' })
  connect(@Param('id') id: string) {
    return this.plcService.connect(id);
  }

  @Get('holding/:address')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Read one holding register' })
  async readHolding(@Param('address') address: string) {
    const values = await this.plcService.readHolding(Number(address), 1);
    return { address: Number(address), value: values[0] ?? 0 };
  }

  /** Admin maintenance only (TP-36). Operators must use HMI cell.activate. */
  @Post('coil')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Write a coil (admin maintenance; audited, bypasses HMI gates)',
  })
  async writeCoil(
    @Body() dto: WriteCoilDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    await this.plcService.writeCoil(dto.address, dto.value);
    await this.auditService.write({
      ...auditWriteFields(auditActorFromRequest(req.user, req.ip)),
      action: 'plc.coil.write',
      resource: `coil:${dto.address}`,
      details: `value=${dto.value}`,
      result: 'success',
    });
    return { ok: true };
  }

  /** Admin maintenance only (TP-36). Operators must use HMI cell.activate. */
  @Post('holding')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Write a holding register (admin maintenance; audited, bypasses HMI gates)',
  })
  async writeHolding(
    @Body() dto: WriteHoldingDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    await this.plcService.writeHolding(dto.address, dto.value);
    await this.auditService.write({
      ...auditWriteFields(auditActorFromRequest(req.user, req.ip)),
      action: 'plc.holding.write',
      resource: `holding:${dto.address}`,
      details: `value=${dto.value}`,
      result: 'success',
    });
    return { ok: true };
  }
}
