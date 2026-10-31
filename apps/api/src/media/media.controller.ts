import {
  Inject,
  Body,
  Controller,
  Get,
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
import { VoiceCommandDto } from './dtos/voice-command.dto';
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

  @Post('voice')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Execute allowlisted voice command' })
  voice(
    @Body() dto: VoiceCommandDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.mediaService.voiceCommand(dto.transcript, {
      userId: req.user.sub,
      userEmail: req.user.email,
      role: req.user.role,
      safeActionPin: dto.safeActionPin,
      ip: req.ip,
    });
  }
}
