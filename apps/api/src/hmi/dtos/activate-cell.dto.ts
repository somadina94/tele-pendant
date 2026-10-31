import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ActivateCellDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  value!: boolean;

  @ApiPropertyOptional({
    description: 'Supervisor PIN for independent safe-action cells',
  })
  @IsOptional()
  @IsString()
  safeActionPin?: string;
}
