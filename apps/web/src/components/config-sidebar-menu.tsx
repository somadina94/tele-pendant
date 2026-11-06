import { useEffect, useState } from 'react';
import { ChevronRight, Settings2 } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import {
  canAccessAppRoute,
  canManageUsers,
  configSectionIdsForRole,
} from '@tele-pendant/shared';
import {
  configSectionGroups,
  parseConfigSection,
  type ConfigSectionId,
} from '@/lib/config-sections';
import { getStoredUserRole } from '@/lib/user-session';
import { useT } from '@/lib/i18n';

export function ConfigSidebarMenu() {
  const { t } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const onConfig = pathname.startsWith('/admin');
  const [subOpen, setSubOpen] = useState(onConfig);

  useEffect(() => {
    if (onConfig) setSubOpen(true);
  }, [onConfig]);

  const role = getStoredUserRole();
  if (!role || !canAccessAppRoute(role, 'config')) return null;

  const showUsers = canManageUsers(role);
  const allowed = new Set(
    configSectionIdsForRole(role),
  ) as Set<ConfigSectionId>;
  const section = parseConfigSection(
    searchParams.get('section'),
    showUsers,
    allowed,
  );
  const groups = configSectionGroups(showUsers, allowed);

  function openSection(id: ConfigSectionId) {
    navigate(`/admin?section=${id}`);
  }

  return (
    <Collapsible
      open={subOpen}
      onOpenChange={setSubOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip={t('config')}
            isActive={onConfig}
            onClick={() => {
              if (!onConfig) {
                setSubOpen(true);
                navigate('/admin?section=plc');
              }
            }}
          >
            <Settings2 />
            <span>{t('config')}</span>
            <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {groups.flatMap((group) =>
              group.items.map((item) => (
                <SidebarMenuSubItem key={item.id}>
                  <SidebarMenuSubButton
                    isActive={onConfig && section === item.id}
                    onClick={() => openSection(item.id)}
                  >
                    <span>{item.label}</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              )),
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
