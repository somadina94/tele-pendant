import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Observable, map } from 'rxjs';
import { SKIP_DATA_WRAP_KEY } from '../../swagger/skip-data-wrap.decorator';

@Injectable()
export class DataResponseInterceptor implements NestInterceptor {
  private readonly configService: ConfigService;
  private readonly reflector: Reflector;

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(Reflector) reflector: Reflector,
  ) {
    this.configService = configService;
    this.reflector = reflector;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_DATA_WRAP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }
    return next.handle().pipe(
      map((data: unknown) => {
        const apiVersion = this.configService.get<string>(
          'appConfig.apiVersion',
        );
        return {
          apiVersion,
          data,
        };
      }),
    );
  }
}
