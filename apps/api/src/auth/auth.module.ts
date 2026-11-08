import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './providers/auth.service';
import { JwtStrategy } from './providers/jwt.strategy';
import { MailService } from './providers/mail.service';
import { OtpChallengeService } from './providers/otp-challenge.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    UsersModule,
    AuditModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('appConfig.jwt.secret'),
        signOptions: {
          audience: configService.get<string>('appConfig.jwt.audience'),
          issuer: configService.get<string>('appConfig.jwt.issuer'),
          expiresIn: configService.get<number>('appConfig.jwt.accessTokenTtl'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, MailService, OtpChallengeService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
