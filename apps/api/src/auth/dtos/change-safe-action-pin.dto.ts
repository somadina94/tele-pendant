import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangeSafeActionPinDto {
  @ApiPropertyOptional({
    description:
      'Current reset PIN. Required when you already set a personal reset PIN.',
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
