import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SavePlcConnectionDto {
  @ApiProperty({ example: 'plant-plc' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @ApiProperty({ example: '192.168.1.50' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  host!: string;

  @ApiProperty({ example: 502 })
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  @Max(255)
  unitId!: number;

  @ApiProperty({
    example: true,
    description: 'When true, this row is the PLC the API connects to',
  })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ example: 'modbus-tcp', enum: ['modbus-tcp', 'opcua'] })
  @IsOptional()
  @IsIn(['modbus-tcp', 'opcua'])
  protocol?: 'modbus-tcp' | 'opcua';
}
