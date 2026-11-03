import {
  Inject,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuth } from '../common/swagger/api-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/providers/jwt-auth.guard';
import { RolesGuard } from '../auth/providers/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { AskDto } from './dtos/ask.dto';
import { UpdateAssistantSettingsDto } from './dtos/update-assistant-settings.dto';
import { AssistantService } from './providers/assistant.service';

@ApiTags('assistant')
@Controller('assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class AssistantController {
  constructor(
    @Inject(AssistantService) private readonly assistant: AssistantService,
  ) {}

  @Get('search')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Local FTS search over manuals' })
  search(@Query('q') q = '') {
    return this.assistant.search(q);
  }

  @Get('settings')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Assistant docs root / link settings' })
  settings() {
    return this.assistant.getSettings();
  }

  @Put('settings')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update docs root / docs link (admin)' })
  updateSettings(@Body() dto: UpdateAssistantSettingsDto) {
    return this.assistant.updateSettings({
      docsRoot: dto.docsRoot,
      docsLink: dto.docsLink,
    });
  }

  @Post('ask')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Ask assistant (Cursor Agent when configured, else FTS)',
  })
  ask(@Body() dto: AskDto) {
    return this.assistant.ask(dto.question);
  }

  @Post('reindex')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Rebuild local FTS index from configured docs root',
  })
  reindex() {
    return this.assistant.reindex();
  }
}
