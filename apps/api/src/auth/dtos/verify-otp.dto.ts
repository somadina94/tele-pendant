import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @MinLength(8)
  challengeId!: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class ResendOtpDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @MinLength(8)
  challengeId!: string;
}
