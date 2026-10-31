import { Inject, Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuth } from '../common/swagger/api-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/providers/jwt-auth.guard';
import { RolesGuard } from '../auth/providers/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { DiagnosticsService } from './providers/diagnostics.service';

@ApiTags('diagnostics')
@Controller('diagnostics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class DiagnosticsController {
  constructor(
    @Inject(DiagnosticsService)
    private readonly diagnostics: DiagnosticsService,
  ) {}

  @Get()
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Runtime diagnostics snapshot' })
  get() {
    return this.diagnostics.snapshot();
  }
}
