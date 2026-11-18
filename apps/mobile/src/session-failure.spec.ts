import {
  ApiStatusError,
  isUnauthorized,
  rejectIfSlow,
} from './session-failure';

describe('session failure', () => {
  it('treats only a 401 as a signed-out session', () => {
    expect(isUnauthorized(new ApiStatusError('nope', 401))).toBe(true);
    expect(isUnauthorized(new ApiStatusError('down', 500))).toBe(false);
    expect(isUnauthorized(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('rejects a probe that never settles', async () => {
    jest.useFakeTimers();
    const pending = rejectIfSlow(new Promise(() => undefined), 3000);
    const assertion = expect(pending).rejects.toThrow(TypeError);
    jest.advanceTimersByTime(3000);
    await assertion;
    jest.useRealTimers();
  });
});
