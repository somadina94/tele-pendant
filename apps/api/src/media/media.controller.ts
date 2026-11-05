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
import { ResolveCodeDto } from './dtos/resolve-code.dto';
import { SaveScanCodeDto } from './dtos/save-scan-code.dto';
import { VoiceCommandDto } from './dtos/voice-command.dto';
import { auditActorFromRequest } from '../common/audit-actor';
import { MediaService } from './providers/media.service';

@ApiTags('media')
@Controller('media')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class MediaController {
  constructor(
    @Inject(MediaService) private readonly mediaService: MediaService,
  ) {}

  @Get('camera')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Camera config (device + optional RTSP)' })
  camera() {
    return this.mediaService.cameraConfig();
  }

  @Get('codes')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'List known QR/barcode payloads' })
  codes() {
    return this.mediaService.listCodes();
  }

  @Post('codes/resolve')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Resolve a scanned QR/barcode' })
  resolve(@Body() dto: ResolveCodeDto) {
    return this.mediaService.resolveCode(dto.code);
  }

  @Post('codes')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Add a QR/barcode payload mapping' })
  createCode(@Body() dto: SaveScanCodeDto) {
    return this.mediaService.saveCode(dto);
  }

  @Patch('codes/:id')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a scan code mapping' })
  updateCode(@Param('id') id: string, @Body() dto: SaveScanCodeDto) {
    return this.mediaService.saveCode({ ...dto, id });
  }

  @Delete('codes/:id')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove a scan code mapping' })
  deleteCode(@Param('id') id: string) {
    return this.mediaService.deleteCode(id);
  }

  @Post('voice')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Execute allowlisted voice command' })
  voice(
    @Body() dto: VoiceCommandDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const actor = auditActorFromRequest(req.user, req.ip);
    return this.mediaService.voiceCommand(dto.transcript, {
      userId: actor.userId,
      userEmail: actor.userEmail,
      userDisplayName: actor.userDisplayName,
      role: req.user.role,
      safeActionPin: dto.safeActionPin,
      alternatives: dto.alternatives,
      ip: actor.ip,
    });
  }
}
