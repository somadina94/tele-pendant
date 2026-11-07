import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
} from 'class-validator';

export class FaceImageDto {
  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Legacy single still — rejected by the API (TP-45). Use frames[3].',
    example: 'data:image/png;base64,AAAA',
  })
  @IsOptional()
  @IsString()
  imageDataUrl?: string;

  @ApiProperty({
    description:
      'Challenge frames in order: center, turn-left, turn-right (3 required).',
    type: [String],
    minItems: 3,
  })
  @IsArray()
  @ArrayMinSize(3)
  @IsString({ each: true })
  frames!: string[];
}

export class FaceLoginDto extends FaceImageDto {
  @ApiPropertyOptional({
    description: 'Optional email hint to narrow match candidates',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
