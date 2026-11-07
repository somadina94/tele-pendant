import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class SaveSafetyRolesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eStopRegisterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deadmanRegisterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  heartbeatRegisterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  safeStateRegisterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowTimedMediaMotion?: boolean;

  /** TP-42: personal reset PIN (or plant fallback) required to change safety roles. */
  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @MinLength(1)
  pin!: string;
}

export class ResetEStopDto {
  @ApiProperty()
  @IsString()
  pin!: string;
}
