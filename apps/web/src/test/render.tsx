import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { UserRole } from '@tele-pendant/shared';
import { ThemeProvider } from '@/components/theme-provider';
import {
  ControlLeaseHeaderControls,
  ControlLeaseProvider,
} from '@/lib/control-lease';
import { TourProvider } from '../lib/tour';

/** Operator tests: header control chrome + session lease lifecycle. */
export function renderOperator(
  ui: ReactElement,
  opts?: { route?: string; role?: UserRole; autoManage?: boolean },
) {
  return renderWithProviders(
    <>
      <ControlLeaseHeaderControls />
      {ui}
    </>,
    { ...opts, autoManage: opts?.autoManage ?? true },
  );
}

function seedTestUser(role?: UserRole) {
  if (!role) return;
  localStorage.setItem(
    'user',
    JSON.stringify({
      id: 'u-test',
      email: 'test@example.com',
      displayName: 'Test User',
      role,
    }),
  );
}

export function renderWithProviders(
  ui: ReactElement,
  opts?: { route?: string; role?: UserRole; autoManage?: boolean },
) {
  seedTestUser(opts?.role);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
      >
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[opts?.route ?? '/']}>
            <TourProvider>
              <ControlLeaseProvider autoManage={opts?.autoManage ?? false}>
                {children}
              </ControlLeaseProvider>
            </TourProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}
