import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class WriteHoldingDto {
  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  address!: number;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(0)
  value!: number;
}
