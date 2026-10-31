import {
  Inject,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuth } from '../common/swagger/api-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/providers/jwt-auth.guard';
import { RolesGuard } from '../auth/providers/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { TrendsService } from './providers/trends.service';

@ApiTags('diagnostics')
@Controller('trends')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class TrendsController {
  constructor(@Inject(TrendsService) private readonly trends: TrendsService) {}

  @Get(':seriesKey')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Trend samples for a series key' })
  series(
    @Param('seriesKey') seriesKey: string,
    @Query('minutes') minutes?: string,
  ) {
    return this.trends.series(seriesKey, minutes ? Number(minutes) : 15);
  }
}
