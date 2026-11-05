import {
  BookOpen,
  Camera,
  ClipboardList,
  Gauge,
  LogOut,
  ScanFace,
  Siren,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { canAccessAppRoute, type AppRoute } from '@tele-pendant/shared';
import { useT } from '@/lib/i18n';
import { getStoredUserRole } from '@/lib/user-session';
import { clearSession } from '@/lib/session';
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
import { BrandLockup } from '@/components/brand-mark';
import { ConfigSidebarMenu } from '@/components/config-sidebar-menu';
import { HelpTip } from '@/lib/tour';

const NAV: {
  to: string;
  labelKey: string;
  icon: typeof Gauge;
  route: AppRoute;
}[] = [
  { to: '/operator', labelKey: 'operator', icon: Gauge, route: 'operator' },
  { to: '/media', labelKey: 'media', icon: Camera, route: 'media' },
  { to: '/assistant', labelKey: 'assistant', icon: BookOpen, route: 'assistant' },
  { to: '/face', labelKey: 'face', icon: ScanFace, route: 'face' },
  { to: '/ops', labelKey: 'ops', icon: Siren, route: 'ops' },
  { to: '/audit', labelKey: 'audit', icon: ClipboardList, route: 'audit' },
];

export function AppSidebar() {
  const { t } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const role = getStoredUserRole();
  const navItems = NAV.filter(
    (item) => role && canAccessAppRoute(role, item.route),
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 border-b border-sidebar-border p-0">
        <div className="flex h-14 items-center px-3">
          <BrandLockup />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <HelpTip id="tour.operator.nav">
              <SidebarMenu>
                {navItems.map((item) => (
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
                <ConfigSidebarMenu />
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
                clearSession();
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
