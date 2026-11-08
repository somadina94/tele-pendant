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
import { AccountMenu } from '@/components/account-menu';
import {
  ControlLeaseHeaderControls,
  ControlLeaseProvider,
} from '@/lib/control-lease';
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
    <ControlLeaseProvider autoManage>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="h-svh overflow-hidden">
          <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-2 py-1.5 md:px-4 md:py-0">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 md:gap-2">
              <SidebarTrigger className="shrink-0" />
              <Separator
                orientation="vertical"
                className="hidden h-4 shrink-0 sm:block"
              />
              <h1 className="min-w-0 truncate text-sm font-semibold">
                {titleFromPath(pathname, t)}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 md:gap-2">
              <ControlLeaseHeaderControls />
              <AccountMenu />
              <PageTourBar screen={screen} />
              <ThemeToggle />
            </div>
          </header>
          <div
            className={
              screen === 'operator'
                ? 'flex min-h-0 flex-1 flex-col overflow-hidden p-2 md:p-4 [&>*]:min-h-0 [&>*]:flex-1'
                : 'flex min-h-0 flex-1 flex-col overflow-auto p-2 md:p-4'
            }
            data-operator-fit={screen === 'operator' ? 'true' : undefined}
          >
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ControlLeaseProvider>
  );
}
