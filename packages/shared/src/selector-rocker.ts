/** Parse "… close/open" style labels into rocker side captions. */
export function parseSelectorSideLabels(label: string): {
  sideA: string;
  sideB: string;
} {
  const trimmed = label.trim();
  const slash = trimmed.lastIndexOf('/');
  if (slash > 0 && slash < trimmed.length - 1) {
    const before = trimmed.slice(0, slash).trim();
    const sideB = trimmed.slice(slash + 1).trim() || 'B';
    const space = before.lastIndexOf(' ');
    const sideA = (space >= 0 ? before.slice(space + 1) : before).trim() || 'A';
    return { sideA, sideB };
  }
  return { sideA: 'A', sideB: 'B' };
}

/**
 * Hold-to-run cells (release clears coils). Latch selectors keep the last side
 * until the opposite side or an explicit center clear.
 */
export function cellUsesHoldToRun(cell: {
  style: string;
  isMotion: boolean;
}): boolean {
  if (cell.style === 'selector' && !cell.isMotion) return false;
  return (
    cell.isMotion ||
    cell.style === 'enable' ||
    cell.style === 'pushbutton' ||
    cell.style === 'selector'
  );
}

/** Motion cells still require control lease + deadman. */
export function cellRequiresControlLease(cell: { isMotion: boolean }): boolean {
  return cell.isMotion;
}
