import { describe, expect, it } from 'vitest';
import { ASSISTANT_SUGGESTION_GROUPS } from './assistant-suggestions';

describe('assistant suggestions', () => {
  it('groups feature questions for the accordion', () => {
    expect(ASSISTANT_SUGGESTION_GROUPS.length).toBeGreaterThan(5);
    expect(
      ASSISTANT_SUGGESTION_GROUPS.every(
        (group) => group.id && group.title && group.questions.length > 0,
      ),
    ).toBe(true);
    expect(
      ASSISTANT_SUGGESTION_GROUPS.some((group) =>
        group.questions.some((q) => /deadman/i.test(q)),
      ),
    ).toBe(true);
  });
});
