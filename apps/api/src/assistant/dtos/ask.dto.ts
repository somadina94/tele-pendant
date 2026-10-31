import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AskDto {
  @ApiProperty({ example: 'What happens on lost Modbus communications?' })
  @IsString()
  @MinLength(2)
  question!: string;
}
