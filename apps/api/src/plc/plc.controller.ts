import {
  Inject,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuth } from '../common/swagger/api-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/providers/jwt-auth.guard';
import { RolesGuard } from '../auth/providers/roles.guard';
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
  constructor(@Inject(PlcService) private readonly plcService: PlcService) {}

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

  @Post('coil')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Write a coil' })
  async writeCoil(@Body() dto: WriteCoilDto) {
    await this.plcService.writeCoil(dto.address, dto.value);
    return { ok: true };
  }

  @Post('holding')
  @Roles(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Write a holding register' })
  async writeHolding(@Body() dto: WriteHoldingDto) {
    await this.plcService.writeHolding(dto.address, dto.value);
    return { ok: true };
  }
}
