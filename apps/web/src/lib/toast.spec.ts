import { beforeEach, describe, expect, it, vi } from 'vitest';

const success = vi.fn();
const error = vi.fn();

vi.mock('sonner', () => ({
  toast: { success, error },
}));

describe('toast helpers', () => {
  beforeEach(() => {
    success.mockClear();
    error.mockClear();
  });

  it('forwards success and error', async () => {
    const { toastOk, toastErr } = await import('./toast');
    toastOk('ok');
    toastErr('bad');
    expect(success).toHaveBeenCalledWith('ok');
    expect(error).toHaveBeenCalledWith('bad');
  });
});
