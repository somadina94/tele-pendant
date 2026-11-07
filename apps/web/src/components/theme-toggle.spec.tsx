import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const setTheme = vi.fn();

vi.mock('@/components/theme-provider', () => ({
  useTheme: () => ({
    resolvedTheme: 'light',
    theme: 'light',
    setTheme,
  }),
}));

describe('ThemeToggle', () => {
  it('requests dark mode from light', async () => {
    const { ThemeToggle } = await import('./theme-toggle');
    render(<ThemeToggle />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to dark mode' }),
    );
    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});
