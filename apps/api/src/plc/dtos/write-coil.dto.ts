import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class WriteCoilDto {
  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  address!: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  value!: boolean;

  @ApiPropertyOptional({
    description: 'Reset PIN. Required to write the e-stop coil off.',
  })
  @IsOptional()
  @IsString()
  pin?: string;
}
