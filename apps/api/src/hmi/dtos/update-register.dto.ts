import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateRegisterDto {
  @ApiProperty({ example: 11, description: 'Modbus address, 0-based' })
  @IsInt()
  @Min(0)
  @Max(65535)
  address!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  trended?: boolean;

  @ApiPropertyOptional({
    description: 'OPC UA node id when the PLC protocol is opcua',
  })
  @IsOptional()
  @IsString()
  nodeId?: string;
}
