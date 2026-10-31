import { of } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { DataResponseInterceptor } from './data-response.interceptor';

describe('DataResponseInterceptor', () => {
  it('wraps payload with apiVersion', (done) => {
    const configService = {
      get: jest.fn().mockReturnValue('v1'),
    } as unknown as ConfigService;
    const interceptor = new DataResponseInterceptor(configService);

    interceptor
      .intercept({} as never, { handle: () => of({ status: 'ok' }) })
      .subscribe((result) => {
        expect(result).toEqual({
          apiVersion: 'v1',
          data: { status: 'ok' },
        });
        done();
      });
  });
});
