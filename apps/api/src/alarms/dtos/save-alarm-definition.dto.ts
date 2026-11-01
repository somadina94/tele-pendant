import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class SaveAlarmDefinitionDto {
  @ApiProperty({ example: 'Overload' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty()
  @IsString()
  registerId!: string;

  @ApiPropertyOptional({ enum: ['eq', 'gt', 'lt', 'neq'] })
  @IsOptional()
  @IsIn(['eq', 'gt', 'lt', 'neq'])
  compareOp?: 'eq' | 'gt' | 'lt' | 'neq';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  threshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateAlarmDefinitionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registerId?: string;

  @ApiPropertyOptional({ enum: ['eq', 'gt', 'lt', 'neq'] })
  @IsOptional()
  @IsIn(['eq', 'gt', 'lt', 'neq'])
  compareOp?: 'eq' | 'gt' | 'lt' | 'neq';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  threshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
