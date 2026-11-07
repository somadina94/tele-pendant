import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CraneMimic } from './crane-mimic';

describe('CraneMimic (FEAT-HMI)', () => {
  it('renders motor and safety data attributes from tags', () => {
    const { container } = render(
      <CraneMimic
        tags={{
          hoistHeightMm: 1000,
          loadKg: 200,
          speedPct: 10,
          trolleyPositionMm: 500,
          motorRunning: true,
          fault: false,
        }}
        safety={{ mode: 'normal', eStopActive: false }}
      />,
    );
    const svg = container.querySelector('[data-feat="hmi-mimic"]');
    expect(svg).toHaveAttribute('data-motor', 'run');
    expect(svg).toHaveAttribute('data-safety', 'ok');
    expect(
      screen.getByRole('img', { name: 'Crane mimic' }),
    ).toBeInTheDocument();
  });

  it('shows safety stop callout on e-stop', () => {
    render(
      <CraneMimic
        tags={{
          hoistHeightMm: 0,
          loadKg: 0,
          speedPct: 0,
          motorRunning: false,
        }}
        safety={{ mode: 'e_stop', eStopActive: true }}
      />,
    );
    expect(screen.getByText('SAFETY STOP')).toBeInTheDocument();
  });

  it('covers warn/fault tones and high load bar colours', () => {
    const { rerender, container } = render(
      <CraneMimic
        tags={{
          hoistHeightMm: 0,
          loadKg: 1200,
          speedPct: 0,
          motorRunning: false,
          fault: true,
        }}
        safety={{ mode: 'comms_lost', watchdogOk: false }}
      />,
    );
    expect(screen.getByText('SAFETY WARN')).toBeInTheDocument();
    expect(screen.getByText('MOTOR FAULT')).toBeInTheDocument();
    expect(container.querySelector('[data-feat="hmi-mimic"]')).toHaveAttribute(
      'data-safety',
      'warn',
    );

    rerender(
      <CraneMimic
        tags={{
          hoistHeightMm: 0,
          loadKg: 1800,
          speedPct: 0,
          motorRunning: false,
        }}
        safety={{ mode: 'normal' }}
      />,
    );
    expect(screen.getByText('MOTOR IDLE')).toBeInTheDocument();
  });
});
