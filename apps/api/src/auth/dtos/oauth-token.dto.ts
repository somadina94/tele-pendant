import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * OAuth2 password-grant body (Swagger Authorize → username + password).
 * `username` is the account email.
 */
export class OAuthTokenDto {
  @ApiPropertyOptional({ example: 'password' })
  @IsOptional()
  @IsString()
  grant_type?: string;

  @ApiProperty({ example: 'admin@example.com', description: 'Account email' })
  @IsEmail()
  username!: string;

  @ApiProperty({ example: 'change-me-admin-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  client_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  client_secret?: string;
}
