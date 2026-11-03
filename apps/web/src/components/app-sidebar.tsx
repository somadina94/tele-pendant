import {
  BookOpen,
  Camera,
  ClipboardList,
  Gauge,
  LogOut,
  ScanFace,
  Settings2,
  Siren,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useT } from '@/lib/i18n';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { HelpTip } from '@/lib/tour';

const NAV = [
  { to: '/operator', labelKey: 'operator', icon: Gauge },
  { to: '/media', labelKey: 'media', icon: Camera },
  { to: '/assistant', labelKey: 'assistant', icon: BookOpen },
  { to: '/face', labelKey: 'face', icon: ScanFace },
  { to: '/ops', labelKey: 'ops', icon: Siren },
  { to: '/admin', labelKey: 'config', icon: Settings2 },
  { to: '/audit', labelKey: 'audit', icon: ClipboardList },
] as const;

export function AppSidebar() {
  const { t } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 border-b border-sidebar-border p-0">
        <div className="flex h-14 items-center gap-2 px-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
            TP
          </div>
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">Tele-Pendant</span>
            <span className="truncate text-xs text-sidebar-foreground/70">
              HMI
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <HelpTip id="tour.operator.nav">
              <SidebarMenu>
                {NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.to}
                      tooltip={t(item.labelKey)}
                    >
                      <NavLink to={item.to}>
                        <item.icon />
                        <span>{t(item.labelKey)}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </HelpTip>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={t('logout')}
              onClick={() => {
                localStorage.removeItem('accessToken');
                navigate('/');
              }}
            >
              <LogOut />
              <span>{t('logout')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
