import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

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
}

export class ResetEStopDto {
  @ApiProperty()
  @IsString()
  pin!: string;
}
