import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateLocaleDto {
  @ApiProperty({ example: 'es' })
  @IsString()
  @MinLength(2)
  locale!: string;
}
