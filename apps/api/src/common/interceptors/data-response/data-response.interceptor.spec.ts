import { of } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DataResponseInterceptor } from './data-response.interceptor';

describe('DataResponseInterceptor', () => {
  const configService = {
    get: jest.fn().mockReturnValue('v1'),
  } as unknown as ConfigService;

  it('wraps payload with apiVersion', (done) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const interceptor = new DataResponseInterceptor(configService, reflector);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
    };

    interceptor
      .intercept(context as never, { handle: () => of({ status: 'ok' }) })
      .subscribe((result) => {
        expect(result).toEqual({
          apiVersion: 'v1',
          data: { status: 'ok' },
        });
        done();
      });
  });

  it('skips wrapping when SkipDataWrap is set', (done) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const interceptor = new DataResponseInterceptor(configService, reflector);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    const token = { access_token: 'jwt', token_type: 'bearer' };

    interceptor
      .intercept(context as never, { handle: () => of(token) })
      .subscribe((result) => {
        expect(result).toEqual(token);
        done();
      });
  });
});
