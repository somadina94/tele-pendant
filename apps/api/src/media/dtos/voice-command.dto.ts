import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class VoiceCommandDto {
  @ApiProperty({ example: 'up' })
  @IsString()
  @MinLength(2)
  transcript!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  safeActionPin?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  alternatives?: string[];
}
