import { describe, expect, it } from 'vitest';
import {
  MATRIX_CELL_STATE_CODE,
  resolveMatrixCellUiState,
} from './matrix-cell-state';

const baseMotion = {
  style: 'default',
  isMotion: true,
  isHolding: false,
  safety: {
    mode: 'normal',
    eStopActive: false,
    watchdogOk: true,
  },
  tags: { fault: false, motorRunning: false, values: {} },
  statusRegisterName: 'discrete.motorRunning',
};

describe('resolveMatrixCellUiState (FEAT-A1)', () => {
  it('is idle when safe and not held', () => {
    expect(resolveMatrixCellUiState(baseMotion)).toBe('idle');
    expect(MATRIX_CELL_STATE_CODE.idle).toBe('IDLE');
  });

  it('is running while held', () => {
    expect(resolveMatrixCellUiState({ ...baseMotion, isHolding: true })).toBe(
      'running',
    );
  });

  it('is running when status register shows RUN', () => {
    expect(
      resolveMatrixCellUiState({
        ...baseMotion,
        tags: {
          fault: false,
          motorRunning: true,
          values: { 'discrete.motorRunning': true },
        },
      }),
    ).toBe('running');
  });

  it('is blocked on e-stop / comms_lost / bad watchdog', () => {
    expect(
      resolveMatrixCellUiState({
        ...baseMotion,
        safety: { mode: 'e_stop', eStopActive: true, watchdogOk: true },
      }),
    ).toBe('blocked');
    expect(
      resolveMatrixCellUiState({
        ...baseMotion,
        safety: { mode: 'comms_lost', eStopActive: false, watchdogOk: false },
      }),
    ).toBe('blocked');
    expect(
      resolveMatrixCellUiState({
        ...baseMotion,
        isHolding: true,
        safety: { mode: 'safe_state', eStopActive: false, watchdogOk: true },
      }),
    ).toBe('blocked');
  });

  it('fault wins over hold and blocked', () => {
    expect(
      resolveMatrixCellUiState({
        ...baseMotion,
        isHolding: true,
        safety: { mode: 'e_stop', eStopActive: true, watchdogOk: true },
        tags: { fault: true, motorRunning: true },
      }),
    ).toBe('fault');
    expect(
      resolveMatrixCellUiState({
        ...baseMotion,
        statusRegisterName: 'discrete.fault',
        tags: {
          fault: false,
          values: { 'discrete.fault': true },
        },
      }),
    ).toBe('fault');
  });

  it('marks STOP as blocked when latched, idle when clear', () => {
    const stop = {
      style: 'estop',
      isMotion: false,
      isHolding: false,
      safety: {
        mode: 'normal' as const,
        eStopActive: false,
        watchdogOk: true,
      },
      tags: { fault: false },
      statusRegisterName: 'coil.eStop',
    };
    expect(resolveMatrixCellUiState(stop)).toBe('idle');
    expect(
      resolveMatrixCellUiState({
        ...stop,
        safety: { mode: 'e_stop', eStopActive: true, watchdogOk: true },
      }),
    ).toBe('blocked');
  });
});
