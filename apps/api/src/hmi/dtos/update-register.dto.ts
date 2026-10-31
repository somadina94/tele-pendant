import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateRegisterDto {
  @ApiProperty({ example: 11, description: 'Modbus address, 0-based' })
  @IsInt()
  @Min(0)
  @Max(65535)
  address!: number;
}
