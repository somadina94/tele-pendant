import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { tourStepsFor } from '@tele-pendant/shared';
import { renderWithProviders } from '../test/render';
import {
  HelpTip,
  PageTourBar,
  placeTourCard,
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

  it('finishes walkthrough on Done at last step and supports PageTourBar start', () => {
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
    expect(
      screen.queryByRole('button', { name: 'Next' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('active')).toHaveTextContent('false');
  });

  it('places tour card above lower-half targets (TP-24)', () => {
    const viewport = { width: 1280, height: 772 };
    const matrix = { top: 520, bottom: 700, left: 200, width: 400 };
    const above = placeTourCard(matrix, 400, 180, viewport);
    expect(above.top).toBeLessThan(matrix.top);
    expect(above.top + 180).toBeLessThanOrEqual(matrix.top);

    const header = { top: 40, bottom: 120, left: 100, width: 300 };
    const below = placeTourCard(header, 400, 180, viewport);
    expect(below.top).toBeGreaterThanOrEqual(header.bottom);
  });

  it('placeTourCard uses the default viewport when omitted', () => {
    const placed = placeTourCard(
      { top: 400, bottom: 480, left: 50, width: 200 },
      320,
      120,
    );
    expect(placed.top).toBe(268);
  });

  it('placeTourCard picks fallbacks when preferred side does not fit', () => {
    const fitsBelowFallback = placeTourCard(
      { top: 161, bottom: 201, left: 50, width: 200 },
      320,
      145,
      { width: 400, height: 400 },
    );
    expect(fitsBelowFallback.top).toBeGreaterThanOrEqual(201);

    const neitherSideFits = placeTourCard(
      { top: 200, bottom: 240, left: 50, width: 200 },
      320,
      260,
      { width: 400, height: 280 },
    );
    expect(neitherSideFits.top).toBe(8);
  });

  it('positions walkthrough card via layout measurement (rAF + resize)', () => {
    localStorage.setItem('tourEnabled', '1');
    const offsetSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockReturnValue(undefined as unknown as number);
    const rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb) => {
        cb(0);
        return 1;
      });
    const cancelSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
    const rect = {
      top: 520,
      bottom: 700,
      left: 200,
      width: 400,
      height: 180,
      right: 600,
      x: 200,
      y: 520,
      toJSON: () => ({}),
    };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      rect as DOMRect,
    );

    const { unmount } = renderWithProviders(
      <>
        <PageTourBar screen="login" />
        <HelpTip id="tour.login.language">
          <span>lang</span>
        </HelpTip>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start tour' }));

    const card = document.querySelector(
      '[role="dialog"] .pointer-events-auto',
    ) as HTMLElement | null;
    expect(card).not.toBeNull();
    expect(card!.style.top).not.toBe('');
    expect(card!.style.left).not.toBe('');

    fireEvent(window, new Event('resize'));
    expect(card!.style.top).not.toBe('');

    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    offsetSpy.mockRestore();
    rafSpy.mockRestore();
    cancelSpy.mockRestore();
  });

  it('skips layout measure after walkthrough unmounts', () => {
    localStorage.setItem('tourEnabled', '1');
    const queued: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      queued.push(cb);
      return queued.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(
      () => undefined,
    );

    const { unmount } = renderWithProviders(<PageTourBar screen="login" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start tour' }));
    expect(queued.length).toBeGreaterThan(0);
    unmount();
    for (const cb of queued) {
      expect(() => cb(0)).not.toThrow();
    }
  });

  it('falls back when the tour target never mounts', () => {
    localStorage.setItem('tourEnabled', '1');
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(
      () => undefined,
    );
    vi.spyOn(window, 'setTimeout').mockImplementation(((
      handler: TimerHandler,
    ) => {
      if (typeof handler === 'function') handler();
      return 1;
    }) as typeof setTimeout);

    renderWithProviders(<PageTourBar screen="login" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start tour' }));

    const card = document.querySelector(
      '[role="dialog"] .pointer-events-auto',
    ) as HTMLElement | null;
    expect(card).not.toBeNull();
    expect(card!.style.bottom).toBe('16px');
    expect(card!.style.top).toBe('');
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

  it('keeps HelpTip className wrapper when tour is off', () => {
    const { container } = renderWithProviders(
      <HelpTip id="tour.login.email" className="plant-slot">
        <span>wrapped</span>
      </HelpTip>,
    );
    expect(container.querySelector('.plant-slot')).toHaveTextContent('wrapped');
    expect(screen.queryByRole('button', { name: /Help:/ })).toBeNull();
  });

  it('prev does not go below zero and stop clears', () => {
    localStorage.setItem('tourEnabled', '1');
    renderWithProviders(<Probe />);
    fireEvent.click(screen.getByRole('button', { name: 'start-operator' }));
    fireEvent.click(screen.getByRole('button', { name: 'prev' }));
    expect(screen.getByTestId('index')).toHaveTextContent('0');
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    const steps = tourStepsFor('operator');
    for (let i = 0; i < steps.length; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'next' }));
    }
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
