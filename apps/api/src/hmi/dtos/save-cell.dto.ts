import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SaveCellDto {
  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  @Max(32)
  row!: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  @Max(32)
  col!: number;

  @ApiProperty({ example: 'Hoist Up' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label!: string;

  @ApiProperty({ example: 'motion' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  style!: string;

  @ApiProperty()
  @IsBoolean()
  isMotion!: boolean;

  @ApiProperty()
  @IsBoolean()
  requiresSafeAction!: boolean;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  primaryRegisterId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feedbackRegisterId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  statusRegisterId?: string | null;
}
