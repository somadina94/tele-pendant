import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('merges class names and tailwind conflicts', () => {
    const includeOptional = false;
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('a', includeOptional && 'b', 'c')).toBe('a c');
  });
});
