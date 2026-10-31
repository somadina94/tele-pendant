import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResolveCodeDto {
  @ApiProperty({ example: 'TP-CRANE-DEMO-01' })
  @IsString()
  @MinLength(2)
  code!: string;
}
