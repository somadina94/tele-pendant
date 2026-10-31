const FILLERS = new Set([
  'please',
  'go',
  'the',
  'a',
  'to',
  'move',
  'crane',
  'and',
  'hey',
  'ok',
  'okay',
  'now',
]);

const TROLLEY_WORDS = new Set(['trolley', 'trolly', 'trawley']);
const RIGHT_WORDS = new Set(['right', 'write', 'rite']);

function normalize(transcript: string): string[] {
  return transcript
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = prev[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j - 1]! + 1, prev[j]! + 1, diag + cost);
      diag = next;
    }
  }
  return prev[b.length]!;
}

function near(token: string, words: Set<string>, maxDist: number): boolean {
  if (words.has(token)) return true;
  for (const word of words) {
    if (Math.abs(word.length - token.length) > maxDist) continue;
    if (levenshtein(token, word) <= maxDist) return true;
  }
  return false;
}

/**
 * Map a speech transcript to an allowlisted cell label.
 * Hoist motion is the words UP and DOWN only.
 */
export function matchVoiceCommand(transcript: string): string | null {
  const tokens = normalize(transcript);
  if (tokens.length === 0) return null;

  let direction: 'up' | 'down' | null = null;
  for (const token of tokens) {
    if (token === 'up') direction = 'up';
    else if (token === 'down') direction = 'down';
  }
  if (direction === 'up') return 'Hoist Up';
  if (direction === 'down') return 'Hoist Down';

  const spoken = (token: string) => !FILLERS.has(token);
  const trolley = tokens.some(
    (token) => spoken(token) && near(token, TROLLEY_WORDS, 1),
  );
  const left = tokens.includes('left');
  const right = tokens.some(
    (token) => spoken(token) && near(token, RIGHT_WORDS, 1),
  );

  if (trolley && left && !right) return 'Trolley L';
  if (trolley && right && !left) return 'Trolley R';
  if (tokens.some((token) => token === 'stop' || token === 'stopped')) {
    return 'STOP';
  }
  return null;
}
