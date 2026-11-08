import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiAuth } from '../common/swagger/api-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/providers/jwt-auth.guard';
import { RolesGuard } from '../auth/providers/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { TagPollerService } from './providers/tag-poller.service';

/**
 * HTTP fallback for live tags when Socket.IO stalls behind a host reverse proxy
 * (common on production; rare on local Docker).
 */
@ApiTags('realtime')
@Controller('realtime')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class RealtimeController {
  constructor(
    @Inject(TagPollerService) private readonly tags: TagPollerService,
  ) {}

  @Get('tags')
  @SkipThrottle()
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Latest live tag snapshot (HTTP backup for tags.update WS)',
  })
  liveTags() {
    return this.tags.latest();
  }
}
