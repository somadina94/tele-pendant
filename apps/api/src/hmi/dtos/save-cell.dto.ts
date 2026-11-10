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

  @ApiPropertyOptional({
    description:
      'FEAT-A2: write holding.speedPct slow/fast while motion is held',
  })
  @IsOptional()
  @IsBoolean()
  variableSpeed?: boolean;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  slowSpeedPct?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  fastSpeedPct?: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  primaryRegisterId!: string;

  @ApiPropertyOptional({
    description:
      'P03A21 selector direction B coil (primary = direction A). Required when style is selector.',
  })
  @IsOptional()
  @IsString()
  secondaryRegisterId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feedbackRegisterId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  statusRegisterId?: string | null;
}
