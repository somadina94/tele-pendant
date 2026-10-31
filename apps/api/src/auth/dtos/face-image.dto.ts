import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class FaceImageDto {
  @ApiProperty({
    description: 'data:image/...;base64,... or raw base64',
    example: 'data:image/png;base64,AAAA',
  })
  @IsString()
  @MinLength(32)
  imageDataUrl!: string;
}

export class FaceLoginDto extends FaceImageDto {
  @ApiPropertyOptional({
    description: 'Optional email hint to narrow match candidates',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
