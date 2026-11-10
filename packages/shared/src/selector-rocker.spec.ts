import { describe, expect, it } from 'vitest';
import {
  cellRequiresControlLease,
  cellUsesHoldToRun,
  parseSelectorSideLabels,
} from './selector-rocker';

describe('parseSelectorSideLabels', () => {
  it('splits the trailing a/b pair from pendant labels', () => {
    expect(parseSelectorSideLabels('OWCVA down/up')).toEqual({
      sideA: 'down',
      sideB: 'up',
    });
    expect(parseSelectorSideLabels('OWFF Flux Flap close/open')).toEqual({
      sideA: 'close',
      sideB: 'open',
    });
    expect(parseSelectorSideLabels('OWHA backw./forw.')).toEqual({
      sideA: 'backw.',
      sideB: 'forw.',
    });
  });

  it('falls back when no slash pair exists', () => {
    expect(parseSelectorSideLabels('Enable')).toEqual({
      sideA: 'A',
      sideB: 'B',
    });
  });
});

describe('cellUsesHoldToRun', () => {
  it('latches non-motion selectors and holds everything else relevant', () => {
    expect(cellUsesHoldToRun({ style: 'selector', isMotion: false })).toBe(
      false,
    );
    expect(cellUsesHoldToRun({ style: 'selector', isMotion: true })).toBe(true);
    expect(cellUsesHoldToRun({ style: 'enable', isMotion: false })).toBe(true);
    expect(cellUsesHoldToRun({ style: 'pushbutton', isMotion: false })).toBe(
      true,
    );
    expect(cellUsesHoldToRun({ style: 'default', isMotion: false })).toBe(
      false,
    );
  });
});

describe('cellRequiresControlLease', () => {
  it('only gates motion cells', () => {
    expect(cellRequiresControlLease({ isMotion: true })).toBe(true);
    expect(cellRequiresControlLease({ isMotion: false })).toBe(false);
  });
});
