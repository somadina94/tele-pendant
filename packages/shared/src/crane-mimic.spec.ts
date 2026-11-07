import { describe, expect, it } from 'vitest';
import { resolveCraneMimicView } from './crane-mimic';

describe('resolveCraneMimicView (FEAT-HMI)', () => {
  it('maps trolley/hoist/load into 0..1 poses', () => {
    const view = resolveCraneMimicView({
      tags: {
        hoistHeightMm: 2500,
        loadKg: 1000,
        speedPct: 40,
        trolleyPositionMm: 1250,
        motorRunning: true,
        fault: false,
      },
      safety: { mode: 'normal', eStopActive: false, watchdogOk: true },
    });
    expect(view.trolleyPct).toBeCloseTo(0.25);
    expect(view.hoistPct).toBeCloseTo(0.5);
    expect(view.loadPct).toBeCloseTo(0.5);
    expect(view.motorTone).toBe('run');
    expect(view.safetyTone).toBe('ok');
  });

  it('marks e-stop and fault tones', () => {
    const estop = resolveCraneMimicView({
      tags: {
        hoistHeightMm: 0,
        loadKg: 0,
        speedPct: 0,
        motorRunning: true,
        fault: false,
      },
      safety: { mode: 'e_stop', eStopActive: true },
    });
    expect(estop.safetyTone).toBe('danger');
    expect(estop.motorTone).toBe('fault');

    const faulted = resolveCraneMimicView({
      tags: {
        hoistHeightMm: 0,
        loadKg: 0,
        speedPct: 0,
        motorRunning: false,
        fault: true,
      },
      safety: { mode: 'normal' },
    });
    expect(faulted.motorTone).toBe('fault');
  });

  it('warns on comms loss and clamps out-of-range values', () => {
    const view = resolveCraneMimicView({
      tags: {
        hoistHeightMm: 9000,
        loadKg: -10,
        speedPct: 0,
        trolleyPositionMm: -5,
        motorRunning: false,
      },
      safety: { mode: 'comms_lost', watchdogOk: false },
    });
    expect(view.hoistPct).toBe(1);
    expect(view.trolleyPct).toBe(0);
    expect(view.loadPct).toBe(0);
    expect(view.safetyTone).toBe('warn');
  });
});
