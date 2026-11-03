import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class FaceImageDto {
  @ApiPropertyOptional({
    description:
      'Single frame (legacy). Prefer frames[] for challenge liveness.',
    example: 'data:image/png;base64,AAAA',
  })
  @ValidateIf((o: FaceImageDto) => !o.frames?.length)
  @IsString()
  @MinLength(32)
  imageDataUrl?: string;

  @ApiPropertyOptional({
    description:
      'Challenge frames in order: center, turn-left, turn-right (3 required).',
    type: [String],
  })
  @ValidateIf((o: FaceImageDto) => !o.imageDataUrl)
  @IsArray()
  @ArrayMinSize(3)
  @IsString({ each: true })
  frames?: string[];
}

export class FaceLoginDto extends FaceImageDto {
  @ApiPropertyOptional({
    description: 'Optional email hint to narrow match candidates',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
