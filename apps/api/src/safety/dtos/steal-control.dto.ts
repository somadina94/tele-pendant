import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class StealControlDto {
  @ApiProperty({
    description:
      'Reset PIN required to steal exclusive Operator control (FEAT-A5)',
  })
  @IsString()
  @MinLength(1)
  pin!: string;
}
