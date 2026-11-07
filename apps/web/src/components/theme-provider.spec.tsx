import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from './theme-provider';

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        dark
      </button>
      <button type="button" onClick={() => setTheme('light')}>
        light
      </button>
      <button type="button" onClick={() => setTheme('system')}>
        system
      </button>
    </div>
  );
}

describe('ThemeProvider', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('light', 'dark');
    vi.restoreAllMocks();
  });

  it('applies and persists an explicit theme', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <ThemeProvider defaultTheme="light" enableSystem={false}>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
    fireEvent.click(screen.getByRole('button', { name: 'dark' }));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(setItem).toHaveBeenCalledWith('theme', 'dark');
  });

  it('maps system default to light when enableSystem is false', () => {
    render(
      <ThemeProvider defaultTheme="system" enableSystem={false}>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    fireEvent.click(screen.getByRole('button', { name: 'system' }));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });

  it('reads a stored theme and follows system preference changes', () => {
    localStorage.setItem('theme', 'system');
    const listeners: Array<(e: MediaQueryListEvent) => void> = [];
    const mq = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: (
        _type: string,
        listener: (e: MediaQueryListEvent) => void,
      ) => {
        listeners.push(listener);
      },
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.spyOn(window, 'matchMedia').mockImplementation(() => mq);

    render(
      <ThemeProvider defaultTheme="system" enableSystem>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('system');
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');

    act(() => {
      Object.defineProperty(mq, 'matches', { value: true, configurable: true });
      listeners.forEach((listener) =>
        listener({ matches: true } as MediaQueryListEvent),
      );
    });
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('ignores invalid stored theme values', () => {
    localStorage.setItem('theme', 'neon');
    render(
      <ThemeProvider defaultTheme="dark" enableSystem>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
  });

  it('tolerates storage read/write failures', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(
      <ThemeProvider defaultTheme="dark" enableSystem>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    fireEvent.click(screen.getByRole('button', { name: 'light' }));
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
  });

  it('useTheme outside a provider returns safe defaults', () => {
    function Outside() {
      const { theme, setTheme } = useTheme();
      return (
        <button type="button" onClick={() => setTheme('dark')}>
          {theme}
        </button>
      );
    }
    render(<Outside />);
    expect(screen.getByRole('button')).toHaveTextContent('system');
    fireEvent.click(screen.getByRole('button'));
  });
});
