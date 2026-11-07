import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangeSafeActionPinDto {
  @ApiPropertyOptional({
    description:
      'Current reset PIN. Required always: plant SAFE_ACTION_PIN for first personal PIN, or your existing personal PIN when changing it (TP-38).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  currentPin?: string;

  @ApiProperty({ minLength: 4, maxLength: 64 })
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  newPin!: string;
}
