import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, chai, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest wraps a rejected value in a function before Chai reads it, and that
// second wrap makes Chai report an empty message. Compare the message here.
function thrownMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value === 'object' && 'message' in value) {
    const message = value.message;
    if (typeof message === 'string') return message;
  }
  return '';
}

type ThrowSuper = (this: object, ...args: unknown[]) => unknown;
const overwriteMethod = (
  chai.util as typeof chai.util & {
    overwriteMethod: (
      ctx: object,
      name: string,
      replacer: (superFn: ThrowSuper) => ThrowSuper,
    ) => void;
  }
).overwriteMethod;

for (const name of ['throw', 'throws', 'Throw']) {
  overwriteMethod(chai.Assertion.prototype, name, (superFn: ThrowSuper) => {
    return function (this: object, ...args: unknown[]) {
      const promise = chai.util.flag(this, 'promise');
      const expected = args[0];
      const stringOrPattern =
        typeof expected === 'string' ||
        expected instanceof RegExp ||
        expected === undefined;
      if (promise !== 'rejects' || !stringOrPattern) {
        return superFn.apply(this, args);
      }
      if (expected === undefined) return;
      const message = thrownMessage(chai.util.flag(this, 'object'));
      const matched =
        expected instanceof RegExp
          ? expected.test(message)
          : message.includes(expected);
      (
        this as {
          assert: (
            expr: boolean,
            msg: string,
            negate: string,
            expected: unknown,
            actual: unknown,
          ) => void;
        }
      ).assert(
        matched,
        'expected #{this} to throw error including #{exp} but got #{act}',
        'expected #{this} to throw error not including #{exp}',
        expected,
        message,
      );
    };
  });
}

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  Element.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    writable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  (
    navigator.mediaDevices?.getUserMedia as unknown as ReturnType<typeof vi.fn>
  )?.mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
  });
});
