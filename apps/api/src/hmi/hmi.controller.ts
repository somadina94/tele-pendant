import {
  Inject,
  Body,
  Controller,
  Get,
  Param,
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
import { UserRole } from '../users/enums/user-role.enum';
import { ActivateCellDto } from './dtos/activate-cell.dto';
import { HmiService } from './providers/hmi.service';

@ApiTags('cells')
@Controller('hmi')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class HmiController {
  constructor(@Inject(HmiService) private readonly hmiService: HmiService) {}

  @Get('layout')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Operator matrix, overlays, and register maps' })
  layout() {
    return this.hmiService.getLayout();
  }

  @Get('registers')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'List Modbus register maps' })
  registers() {
    return this.hmiService.listRegisters();
  }

  @Post('cells/:id/activate')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Press/release a matrix cell (Modbus write)' })
  activate(
    @Param('id') id: string,
    @Body() dto: ActivateCellDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.hmiService.activateCell(id, dto.value, {
      userId: req.user.sub,
      userEmail: req.user.email,
      role: req.user.role,
      safeActionPin: dto.safeActionPin,
      ip: req.ip,
    });
  }
}
