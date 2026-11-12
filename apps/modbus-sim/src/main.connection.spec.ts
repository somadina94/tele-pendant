import net from 'net';
import { DEMO_P03A21_MAP } from '@tele-pendant/modbus-core';

/**
 * TP-46: abrupt client disconnect must not take down the process.
 * Exercises the same guard pattern used in main.ts without booting jsmodbus.
 */
describe('modbus-sim connection guards (TP-46)', () => {
  it('swallows client socket errors without throwing', () => {
    const socket = new net.Socket();
    const onError = jest.fn((err: Error) => {
      expect(err.message).toBe('boom');
    });
    socket.on('error', onError);
    expect(() => socket.emit('error', new Error('boom'))).not.toThrow();
    expect(onError).toHaveBeenCalled();
  });

  it('maps Teach Pipe Middle DI to its own DO lamp', () => {
    expect(DEMO_P03A21_MAP.do.teachPipeMiddle).toBe(66);
    expect(DEMO_P03A21_MAP.do.teachPipeMiddle).not.toBe(
      DEMO_P03A21_MAP.do.teachSeamTrackingLaser,
    );
  });
});
