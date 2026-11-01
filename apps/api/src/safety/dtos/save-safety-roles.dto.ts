import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

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
}
