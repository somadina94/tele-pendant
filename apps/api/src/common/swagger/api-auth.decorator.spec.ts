import { ApiAuth } from './api-auth.decorator';

describe('ApiAuth', () => {
  it('returns a decorator function', () => {
    const decorator = ApiAuth();
    expect(typeof decorator).toBe('function');
  });
});
