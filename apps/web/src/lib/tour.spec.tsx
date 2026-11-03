import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { tourStepsFor } from '@tele-pendant/shared';
import { renderWithProviders } from '../test/render';
import {
  HelpTip,
  PageTourBar,
  readTourEnabled,
  useTour,
  writeTourEnabled,
} from './tour';
import {
  readTourEnabled as readStored,
  writeTourEnabled as writeStored,
} from './tour-storage';

function Probe() {
  const tour = useTour();
  return (
    <div>
      <span data-testid="enabled">{String(tour.enabled)}</span>
      <span data-testid="active">{String(tour.walkthroughActive)}</span>
      <span data-testid="step">{tour.currentStepId ?? 'none'}</span>
      <span data-testid="index">{String(tour.stepIndex)}</span>
      <button type="button" onClick={() => tour.setEnabled(true)}>
        enable
      </button>
      <button type="button" onClick={() => tour.setEnabled(false)}>
        disable
      </button>
      <button type="button" onClick={() => tour.startWalkthrough('login')}>
        start-login
      </button>
      <button type="button" onClick={() => tour.startWalkthrough('operator')}>
        start-operator
      </button>
      <button type="button" onClick={() => tour.nextStep()}>
        next
      </button>
      <button type="button" onClick={() => tour.prevStep()}>
        prev
      </button>
      <button type="button" onClick={() => tour.stopWalkthrough()}>
        stop
      </button>
    </div>
  );
}

describe('tour helpers', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('exports ordered steps for shared screens', () => {
    expect(tourStepsFor('login')[0]).toBe('tour.login.language');
    expect(tourStepsFor('config')).toContain('tour.config.safety');
  });

  it('defaults tour off and persists toggle', () => {
    expect(readTourEnabled()).toBe(false);
    writeTourEnabled(true);
    expect(readTourEnabled()).toBe(true);
    writeTourEnabled(false);
    expect(readTourEnabled()).toBe(false);
  });

  it('survives localStorage failures', () => {
    const getSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    expect(readTourEnabled()).toBe(false);
    getSpy.mockRestore();
    const setSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });
    writeTourEnabled(true);
    setSpy.mockRestore();
  });

  it('starts walkthrough only when enabled and advances steps', () => {
    localStorage.setItem('tourEnabled', '1');
    renderWithProviders(
      <>
        <Probe />
        <PageTourBar screen="login" />
        <HelpTip id="tour.login.language">
          <span>lang</span>
        </HelpTip>
      </>,
    );
    expect(screen.getByTestId('enabled')).toHaveTextContent('true');
    fireEvent.click(screen.getByRole('button', { name: 'start-login' }));
    expect(screen.getByTestId('active')).toHaveTextContent('true');
    expect(screen.getByTestId('step')).toHaveTextContent('tour.login.language');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('step')).toHaveTextContent('tour.login.email');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('step')).toHaveTextContent('tour.login.language');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('active')).toHaveTextContent('false');
  });

  it('ignores start when disabled and clears walkthrough on disable', () => {
    renderWithProviders(<Probe />);
    fireEvent.click(screen.getByRole('button', { name: 'start-login' }));
    expect(screen.getByTestId('active')).toHaveTextContent('false');
    fireEvent.click(screen.getByRole('button', { name: 'enable' }));
    fireEvent.click(screen.getByRole('button', { name: 'start-login' }));
    expect(screen.getByTestId('active')).toHaveTextContent('true');
    fireEvent.click(screen.getByRole('button', { name: 'disable' }));
    expect(screen.getByTestId('enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('active')).toHaveTextContent('false');
    expect(localStorage.getItem('tourEnabled')).toBe('0');
  });

  it('finishes walkthrough on last next and supports PageTourBar start', () => {
    localStorage.setItem('tourEnabled', '1');
    renderWithProviders(
      <>
        <Probe />
        <PageTourBar screen="login" />
        <HelpTip id="tour.login.language">
          <button type="button">child</button>
        </HelpTip>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start tour' }));
    const steps = tourStepsFor('login');
    for (let i = 0; i < steps.length - 1; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    }
    expect(screen.getByTestId('index')).toHaveTextContent(
      String(steps.length - 1),
    );
    // Last primary control is labeled Done but calls nextStep → finish
    const actions = screen.getByRole('dialog').querySelectorAll('button');
    fireEvent.click(actions[actions.length - 1]!);
    expect(screen.getByTestId('active')).toHaveTextContent('false');
  });

  it('toggles HelpTip popover when tour is on', () => {
    localStorage.setItem('tourEnabled', '1');
    renderWithProviders(
      <HelpTip id="tour.login.email">
        <span>email field</span>
      </HelpTip>,
    );
    expect(screen.getByText('email field')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Help: tour.login.email' }),
    );
    expect(screen.getByText(/Your login email/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Help: tour.login.email' }),
    );
  });

  it('hides HelpTip chrome when tour is off', () => {
    renderWithProviders(
      <HelpTip id="tour.login.email">
        <span>plain</span>
      </HelpTip>,
    );
    expect(screen.queryByRole('button', { name: /Help:/ })).toBeNull();
    expect(screen.getByText('plain')).toBeInTheDocument();
  });

  it('prev does not go below zero and stop clears', () => {
    localStorage.setItem('tourEnabled', '1');
    renderWithProviders(<Probe />);
    fireEvent.click(screen.getByRole('button', { name: 'start-operator' }));
    fireEvent.click(screen.getByRole('button', { name: 'prev' }));
    expect(screen.getByTestId('index')).toHaveTextContent('0');
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    fireEvent.click(screen.getByRole('button', { name: 'stop' }));
    expect(screen.getByTestId('active')).toHaveTextContent('false');
  });

  it('TourToggle checkbox updates storage', () => {
    renderWithProviders(<PageTourBar screen="ops" />);
    const box = screen.getByLabelText('Tour help');
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(localStorage.getItem('tourEnabled')).toBe('1');
    expect(
      screen.getByRole('button', { name: 'Start tour' }),
    ).toBeInTheDocument();
  });
});

describe('tour-storage', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('mirrors the tour.tsx storage helpers', () => {
    expect(readStored()).toBe(false);
    writeStored(true);
    expect(readStored()).toBe(true);
    expect(readTourEnabled()).toBe(true);
  });
});

describe('useTour guard', () => {
  it('errors when rendered without provider', () => {
    function Bad() {
      useTour();
      return null;
    }
    expect(() => {
      render(createElement(Bad));
    }).toThrow(/TourProvider/);
  });
});
