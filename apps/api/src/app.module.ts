import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { DataResponseInterceptor } from './common/interceptors/data-response/data-response.interceptor';
import { AlarmsModule } from './alarms/alarms.module';
import { AssistantModule } from './assistant/assistant.module';
import { DiagnosticsModule } from './diagnostics/diagnostics.module';
import { HmiModule } from './hmi/hmi.module';
import { MediaModule } from './media/media.module';
import { PlcModule } from './plc/plc.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SafetyModule } from './safety/safety.module';
import { TrendsModule } from './trends/trends.module';
import { UsersModule } from './users/users.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import enviromentValidation from './config/enviroment.validation';

const ENV = process.env.NODE_ENV;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', `.env.${ENV}`, `.env.${ENV}.local`].filter(Boolean),
      load: [appConfig, databaseConfig],
      validationSchema: enviromentValidation,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'better-sqlite3',
        database: configService.get<string>('database.path'),
        synchronize: configService.get<boolean>('database.synchronize'),
        autoLoadEntities: configService.get<boolean>(
          'database.autoLoadEntities',
        ),
      }),
    }),
    AuditModule,
    AuthModule,
    PlcModule,
    SafetyModule,
    RealtimeModule,
    HmiModule,
    AlarmsModule,
    TrendsModule,
    DiagnosticsModule,
    MediaModule,
    AssistantModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: DataResponseInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
