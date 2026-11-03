import { Outlet, useLocation } from 'react-router-dom';
import type { TourScreen } from '@tele-pendant/shared';
import { AppSidebar } from '@/components/app-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { PageTourBar } from '@/lib/tour';
import { useT } from '@/lib/i18n';

export function screenFromPath(pathname: string): TourScreen {
  if (pathname.startsWith('/media')) return 'media';
  if (pathname.startsWith('/ops')) return 'ops';
  if (pathname.startsWith('/face')) return 'face';
  if (pathname.startsWith('/audit')) return 'audit';
  if (pathname.startsWith('/assistant')) return 'assistant';
  if (pathname.startsWith('/admin')) return 'config';
  return 'operator';
}

function titleFromPath(pathname: string, t: (key: string) => string): string {
  const screen = screenFromPath(pathname);
  if (screen === 'config') return t('config');
  return t(screen);
}

export function AppShell() {
  const { pathname } = useLocation();
  const { t } = useT();
  const screen = screenFromPath(pathname);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 md:px-4">
          <SidebarTrigger />
          <Separator
            orientation="vertical"
            className="mr-2 hidden h-4 sm:block"
          />
          <h1 className="truncate text-sm font-semibold">
            {titleFromPath(pathname, t)}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <PageTourBar screen={screen} />
            <ThemeToggle />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3 md:p-4">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
