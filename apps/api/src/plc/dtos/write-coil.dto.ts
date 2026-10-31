import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Min } from 'class-validator';

export class WriteCoilDto {
  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  address!: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  value!: boolean;
}
