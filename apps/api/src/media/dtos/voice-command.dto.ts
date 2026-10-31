import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class VoiceCommandDto {
  @ApiProperty({ example: 'hoist up' })
  @IsString()
  @MinLength(2)
  transcript!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  safeActionPin?: string;
}
