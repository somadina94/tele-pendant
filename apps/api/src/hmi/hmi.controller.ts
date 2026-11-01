import {
  Inject,
  Body,
  Controller,
  Delete,
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
import { UserRole } from '../users/enums/user-role.enum';
import { ActivateCellDto } from './dtos/activate-cell.dto';
import { SaveBackgroundDto } from './dtos/save-background.dto';
import { SaveCellDto } from './dtos/save-cell.dto';
import { SaveOverlayDto } from './dtos/save-overlay.dto';
import { UpdateRegisterDto } from './dtos/update-register.dto';
import { HmiService } from './providers/hmi.service';

@ApiTags('cells')
@Controller('hmi')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class HmiController {
  constructor(@Inject(HmiService) private readonly hmiService: HmiService) {}

  private actor(req: Request & { user: JwtPayload }) {
    return {
      userId: req.user.sub,
      userEmail: req.user.email,
      ip: req.ip,
    };
  }

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

  @Patch('registers/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Set the Modbus address for a named register' })
  updateRegister(
    @Param('id') id: string,
    @Body() dto: UpdateRegisterDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.hmiService.updateRegister(id, dto.address, this.actor(req), {
      nodeId: dto.nodeId,
      trended: dto.trended,
    });
  }

  @Post('cells')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Add a matrix cell' })
  createCell(
    @Body() dto: SaveCellDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.hmiService.createCell(dto, this.actor(req));
  }

  @Patch('cells/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Update a matrix cell and its three addresses' })
  updateCell(
    @Param('id') id: string,
    @Body() dto: SaveCellDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.hmiService.updateCell(id, dto, this.actor(req));
  }

  @Delete('cells/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Remove a matrix cell' })
  deleteCell(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.hmiService.deleteCell(id, this.actor(req));
  }

  @Post('overlays')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Add a live label on the background' })
  createOverlay(
    @Body() dto: SaveOverlayDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.hmiService.createOverlay(dto, this.actor(req));
  }

  @Patch('overlays/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Move or rebind a live label' })
  updateOverlay(
    @Param('id') id: string,
    @Body() dto: SaveOverlayDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.hmiService.updateOverlay(id, dto, this.actor(req));
  }

  @Delete('overlays/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Remove a live label' })
  deleteOverlay(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.hmiService.deleteOverlay(id, this.actor(req));
  }

  @Patch('background')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Update the active plant graphic' })
  updateBackground(
    @Body() dto: SaveBackgroundDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.hmiService.updateBackground(dto, this.actor(req));
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
