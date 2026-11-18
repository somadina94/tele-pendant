import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { readControlClientId } from '../../safety/control-client-id';
import { auditRequestContext } from '../audit-request-context';

@Injectable()
export class AuditRequestInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const clientId = readControlClientId(req) || null;
    return new Observable((subscriber) => {
      const sub = auditRequestContext.run({ clientId }, () =>
        next.handle().subscribe(subscriber),
      );
      return () => sub.unsubscribe();
    });
  }
}
