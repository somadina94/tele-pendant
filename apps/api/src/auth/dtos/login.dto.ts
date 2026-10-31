import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * Operator / admin login credentials.
 */
export class LoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'change-me-admin-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
