import { matchVoiceCommand } from './voice-match';

describe('matchVoiceCommand', () => {
  it('maps UP and DOWN, including when other words are around them', () => {
    expect(matchVoiceCommand('up')).toBe('Hoist Up');
    expect(matchVoiceCommand('DOWN')).toBe('Hoist Down');
    expect(matchVoiceCommand('  Up! ')).toBe('Hoist Up');
    expect(matchVoiceCommand('please hoist up now')).toBe('Hoist Up');
    expect(matchVoiceCommand('hoist down')).toBe('Hoist Down');
    expect(matchVoiceCommand('go down please')).toBe('Hoist Down');
    expect(matchVoiceCommand('up down')).toBe('Hoist Down');
  });

  it('does not treat hoist mishears as commands', () => {
    expect(matchVoiceCommand('hoist')).toBeNull();
    expect(matchVoiceCommand('hoist town')).toBeNull();
    expect(matchVoiceCommand('hoist cup')).toBeNull();
    expect(matchVoiceCommand('host')).toBeNull();
    expect(matchVoiceCommand('highest')).toBeNull();
  });

  it('maps trolley, stop, and ignores unknown speech', () => {
    expect(matchVoiceCommand('trolley left')).toBe('Trolley L');
    expect(matchVoiceCommand('trolley right')).toBe('Trolley R');
    expect(matchVoiceCommand('trolly left')).toBe('Trolley L');
    expect(matchVoiceCommand('trolle left')).toBe('Trolley L');
    expect(matchVoiceCommand('trolley write')).toBe('Trolley R');
    expect(matchVoiceCommand('trolley left right')).toBeNull();
    expect(matchVoiceCommand('please stop')).toBe('STOP');
    expect(matchVoiceCommand('stop')).toBe('STOP');
    expect(matchVoiceCommand('emergency stop')).toBe('STOP');
    expect(matchVoiceCommand('stopped')).toBe('STOP');
    expect(matchVoiceCommand('dance party')).toBeNull();
    expect(matchVoiceCommand('   ')).toBeNull();
    expect(matchVoiceCommand('qq')).toBeNull();
    expect(matchVoiceCommand('xyzzy')).toBeNull();
  });
});
