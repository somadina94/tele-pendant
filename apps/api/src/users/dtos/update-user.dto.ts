import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '../enums/user-role.enum';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: [UserRole.OPERATOR, UserRole.SUPERVISOR] })
  @IsOptional()
  @IsIn([UserRole.OPERATOR, UserRole.SUPERVISOR])
  role?: UserRole.OPERATOR | UserRole.SUPERVISOR;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  suspended?: boolean;

  @ApiPropertyOptional({ minLength: 8, description: 'Admin password reset' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
