import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAssistantSettingsDto {
  @ApiProperty({ example: 'docs' })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  docsRoot!: string;

  @ApiPropertyOptional({
    example: 'https://example.com/docs/USER_MANUAL.md',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  docsLink?: string;
}
