import { Controller, Get, Inject, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/providers/jwt-auth.guard';
import { RolesGuard } from '../auth/providers/roles.guard';
import { ApiAuth } from '../common/swagger/api-auth.decorator';
import { SkipDataWrap } from '../common/swagger/skip-data-wrap.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { parseAuditListQuery } from './dtos/list-audit-query.dto';
import { AuditService } from './providers/audit.service';

@ApiTags('audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
@ApiAuth()
export class AuditController {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries (paginated, filterable)' })
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('user') user?: string,
  ) {
    const parsed = parseAuditListQuery({
      page,
      pageSize,
      limit,
      from,
      to,
      user,
    });
    return this.auditService.query(parsed);
  }

  @Get('export')
  @SkipDataWrap()
  @ApiOperation({ summary: 'Export filtered audit log as CSV' })
  async exportCsv(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('user') user?: string,
  ) {
    const parsed = parseAuditListQuery({ from, to, user });
    const csv = await this.auditService.exportCsv(parsed);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-${stamp}.csv"`,
    );
    res.send(csv);
  }
}
