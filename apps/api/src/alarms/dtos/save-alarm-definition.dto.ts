import { ALARM_SEVERITIES } from '@tele-pendant/shared';
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

  @ApiPropertyOptional({ enum: [...ALARM_SEVERITIES] })
  @IsOptional()
  @IsIn([...ALARM_SEVERITIES])
  severity?: (typeof ALARM_SEVERITIES)[number];

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

  @ApiPropertyOptional({ enum: [...ALARM_SEVERITIES] })
  @IsOptional()
  @IsIn([...ALARM_SEVERITIES])
  severity?: (typeof ALARM_SEVERITIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
