import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

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

  /** FEAT-A2: jog speed for variable-speed motion cells (hold-to-run still required). */
  @ApiPropertyOptional({ enum: ['slow', 'fast'], example: 'fast' })
  @IsOptional()
  @IsIn(['slow', 'fast'])
  speed?: 'slow' | 'fast';

  /** Mid-hold coil refresh — skips audit so Operator pulse does not flood the log. */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}
