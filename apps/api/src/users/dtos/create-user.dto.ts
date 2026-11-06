import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../enums/user-role.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'operator@plant.local' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'Jordan Lee' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @ApiProperty({ example: 'ChangeMeNow1!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: [UserRole.OPERATOR, UserRole.SUPERVISOR] })
  @IsIn([UserRole.OPERATOR, UserRole.SUPERVISOR])
  role!: UserRole.OPERATOR | UserRole.SUPERVISOR;
}
