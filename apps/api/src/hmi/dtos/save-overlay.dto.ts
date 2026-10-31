import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SaveOverlayDto {
  @ApiProperty({ example: 'Height' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label!: string;

  @ApiProperty({ example: 18 })
  @IsNumber()
  @Min(0)
  @Max(100)
  xPct!: number;

  @ApiProperty({ example: 22 })
  @IsNumber()
  @Min(0)
  @Max(100)
  yPct!: number;

  @ApiProperty({ example: '{value} mm' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  format!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registerId?: string | null;
}
