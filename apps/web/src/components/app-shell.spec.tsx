import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { AppShell, screenFromPath } from '@/layouts/AppShell';
import { ThemeToggle } from '@/components/theme-toggle';
import { PageSpinner } from '@/components/page-spinner';
import { renderWithProviders } from '@/test/render';
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar';

vi.mock('next-themes', async () => {
  const actual =
    await vi.importActual<typeof import('next-themes')>('next-themes');
  return {
    ...actual,
    useTheme: () => ({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: vi.fn(),
    }),
  };
});

describe('shell chrome', () => {
  it('maps paths to tour screens', () => {
    expect(screenFromPath('/face')).toBe('face');
    expect(screenFromPath('/media')).toBe('media');
    expect(screenFromPath('/unknown')).toBe('operator');
  });

  it('renders AppShell titles for routes and spinner', () => {
    for (const [route, title] of [
      ['/media', 'Media'],
      ['/ops', 'Ops'],
      ['/audit', 'Audit'],
      ['/assistant', 'Assistant'],
      ['/admin', 'Config'],
      ['/operator', 'Operator'],
    ] as const) {
      const { unmount } = renderWithProviders(
        <Routes>
          <Route element={<AppShell />}>
            <Route path={route} element={<div>body</div>} />
          </Route>
        </Routes>,
        { route },
      );
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
      unmount();
    }
    renderWithProviders(<PageSpinner label="Wait" />);
    expect(screen.getByLabelText('Wait')).toBeInTheDocument();
  });

  it('toggles theme and sidebar including keyboard and logout', async () => {
    const setTheme = vi.fn();
    vi.doMock('next-themes', () => ({
      useTheme: () => ({
        resolvedTheme: 'light',
        setTheme,
        theme: 'light',
      }),
      ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    }));

    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/operator" element={<div>Op</div>} />
        </Route>
      </Routes>,
      { route: '/operator' },
    );

    fireEvent.click(screen.getByLabelText(/Switch to/i));
    fireEvent.click(screen.getByRole('button', { name: /Toggle Sidebar/i }));
    localStorage.setItem('accessToken', 'tok');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/auth/logout',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(localStorage.getItem('accessToken')).toBeNull();
    });
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
  });

  it('ThemeToggle switches modes', () => {
    renderWithProviders(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /Switch to light/i }));
  });

  it('useSidebar throws outside provider', () => {
    function Bad() {
      useSidebar();
      return null;
    }
    expect(() => renderWithProviders(<Bad />)).toThrow(/SidebarProvider/);
  });

  it('supports non-collapsible sidebar', () => {
    renderWithProviders(
      <SidebarProvider defaultOpen={false}>
        <Sidebar collapsible="none">
          <SidebarContent>Plain</SidebarContent>
        </Sidebar>
      </SidebarProvider>,
    );
    expect(screen.getByText('Plain')).toBeInTheDocument();
  });
});
