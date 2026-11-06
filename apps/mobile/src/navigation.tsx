import { Pressable, Text, View } from 'react-native';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  BookOpen,
  Camera,
  ClipboardList,
  Gauge,
  KeyRound,
  LogOut,
  Menu,
  ScanFace,
  Settings2,
  Siren,
} from 'lucide-react-native';
import {
  canAccessAppRoute,
  canEditAssistantSettings,
  canShelveAlarms,
  type UserRole,
} from '@tele-pendant/shared';
import { AccessDeniedScreen } from './access-denied';
import { useLocale } from './locale';
import { HelpTip, TourBar } from './tour';
import { ThemeToggle, useTheme } from './theme';
import { OperatorScreen } from './screens/OperatorScreen';
import { OpsScreen } from './screens/OpsScreen';
import { BrandLockup } from './brand';
import { MediaScreen } from './screens/MediaScreen';
import { AssistantScreen } from './screens/AssistantScreen';
import { FaceScreen } from './screens/FaceScreen';
import { ConfigScreen } from './screens/ConfigScreen';
import { AuditScreen } from './screens/AuditScreen';
import { ChangePasswordScreen } from './screens/ChangePasswordScreen';
import type { ScreenName } from './types';

export type RootDrawerParamList = {
  MainTabs: undefined;
  face: undefined;
  config: undefined;
  audit: undefined;
  changePassword: undefined;
};

export type MainTabParamList = {
  operator: undefined;
  ops: undefined;
  media: undefined;
  assistant: undefined;
};

const Drawer = createDrawerNavigator<RootDrawerParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const ICON = {
  operator: Gauge,
  media: Camera,
  assistant: BookOpen,
  face: ScanFace,
  ops: Siren,
  config: Settings2,
  audit: ClipboardList,
} as const;

function iconColor(active: boolean, dark: boolean) {
  if (active) return '#3D9CFD';
  return dark ? '#8B9AAB' : '#5C6B7A';
}

function DrawerItems({
  props,
  onLogout,
  userRole,
}: {
  props: DrawerContentComponentProps;
  onLogout: () => void;
  userRole: UserRole | null;
}) {
  const { t } = useLocale();
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const routeName = props.state.routes[props.state.index]?.name;
  const tabState = props.state.routes.find((r) => r.name === 'MainTabs')?.state;
  const tabRoute =
    tabState && 'index' in tabState && tabState.routes
      ? tabState.routes[tabState.index ?? 0]?.name
      : 'operator';

  const allItems: Array<{ id: ScreenName; target: 'tab' | 'drawer' }> = [
    { id: 'operator', target: 'tab' },
    { id: 'media', target: 'tab' },
    { id: 'assistant', target: 'tab' },
    { id: 'face', target: 'drawer' },
    { id: 'ops', target: 'tab' },
    { id: 'config', target: 'drawer' },
    { id: 'audit', target: 'drawer' },
  ];
  const items = allItems.filter((item) => {
    if (item.id === 'config' || item.id === 'audit') {
      return userRole !== null && canAccessAppRoute(userRole, item.id);
    }
    return true;
  });

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ flexGrow: 1 }}
      className="bg-background"
    >
      <View className="mb-4 border-b border-border px-3 pb-4 pt-2">
        <BrandLockup />
      </View>
      <HelpTip id="tour.operator.nav">
        <View className="gap-1 px-2">
          {items.map((item) => {
            const Icon = ICON[item.id];
            const active =
              item.target === 'tab'
                ? routeName === 'MainTabs' && tabRoute === item.id
                : routeName === item.id;
            return (
              <Pressable
                key={item.id}
                className={`flex-row items-center gap-3 rounded-lg px-3 py-3 ${
                  active ? 'bg-muted' : ''
                }`}
                onPress={() => {
                  if (item.target === 'tab') {
                    (
                      props.navigation.navigate as (
                        name: string,
                        params?: object,
                      ) => void
                    )('MainTabs', { screen: item.id });
                  } else {
                    (props.navigation.navigate as (name: string) => void)(
                      item.id,
                    );
                  }
                }}
              >
                <Icon size={18} color={iconColor(active, dark)} />
                <Text
                  className={`text-sm ${
                    active
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {t(item.id)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </HelpTip>
      <View className="mt-auto border-t border-border px-2 pt-3">
        <Pressable
          className="flex-row items-center gap-3 rounded-lg px-3 py-3"
          onPress={() =>
            (props.navigation.navigate as (name: string) => void)(
              'changePassword',
            )
          }
        >
          <KeyRound size={18} color={iconColor(false, dark)} />
          <Text className="text-sm text-muted-foreground">Change password</Text>
        </Pressable>
        <Pressable
          className="flex-row items-center gap-3 rounded-lg px-3 py-3"
          onPress={onLogout}
        >
          <LogOut size={18} color={iconColor(false, dark)} />
          <Text className="text-sm text-muted-foreground">{t('logout')}</Text>
        </Pressable>
      </View>
    </DrawerContentScrollView>
  );
}

function MainTabs({
  token,
  userRole,
}: {
  token: string;
  userRole: UserRole | null;
}) {
  const { t } = useLocale();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: dark ? '#161D27' : '#FFFFFF',
          borderTopColor: dark ? '#2A3A4D' : '#C5D0DC',
        },
        tabBarActiveTintColor: '#3D9CFD',
        tabBarInactiveTintColor: dark ? '#8B9AAB' : '#5C6B7A',
        tabBarIcon: ({ color, size }) => {
          const Icon = ICON[route.name as keyof typeof ICON];
          return <Icon size={size} color={color} />;
        },
        tabBarLabel: t(route.name),
      })}
    >
      <Tab.Screen name="operator">
        {() => <OperatorScreen token={token} />}
      </Tab.Screen>
      <Tab.Screen name="ops">
        {() => <OpsScreen token={token} userRole={userRole} />}
      </Tab.Screen>
      <Tab.Screen name="media">
        {() => <MediaScreen token={token} />}
      </Tab.Screen>
      <Tab.Screen name="assistant">
        {() => <AssistantScreen token={token} userRole={userRole} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

function screenTitle(
  routeName: string,
  tabName: string | undefined,
  t: (key: string) => string,
) {
  if (routeName === 'MainTabs') return t(tabName ?? 'operator');
  return t(routeName);
}

function tourScreenFor(
  routeName: string,
  tabName: string | undefined,
): ScreenName {
  if (routeName === 'MainTabs') {
    return (tabName as ScreenName) ?? 'operator';
  }
  return routeName as ScreenName;
}

export function AppShell({
  token,
  userRole,
  onLogout,
  onToken,
}: {
  token: string;
  userRole: UserRole | null;
  onLogout: () => void;
  onToken: (token: string) => void;
}) {
  const { t } = useLocale();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  return (
    <Drawer.Navigator
      screenOptions={({ navigation, route }) => {
        const tabState = navigation
          .getState()
          .routes.find((r) => r.name === 'MainTabs')?.state;
        const tabName =
          tabState && 'routes' in tabState
            ? tabState.routes[tabState.index ?? 0]?.name
            : 'operator';
        const title = screenTitle(route.name, tabName, t);
        const tourScreen = tourScreenFor(route.name, tabName);
        return {
          headerStyle: {
            backgroundColor: dark ? '#0F1419' : '#F4F7FB',
          },
          headerTintColor: dark ? '#E8EEF4' : '#0F1419',
          headerTitle: title,
          headerLeft: () => (
            <Pressable
              className="ml-2 mr-1 h-9 w-9 items-center justify-center"
              onPress={() => navigation.toggleDrawer()}
              accessibilityLabel="Open menu"
            >
              <Menu size={20} color={dark ? '#E8EEF4' : '#0F1419'} />
            </Pressable>
          ),
          headerRight: () => (
            <View className="mr-2 flex-row items-center gap-1">
              <TourBar screen={tourScreen} compact />
              <ThemeToggle />
            </View>
          ),
          drawerStyle: {
            backgroundColor: dark ? '#0F1419' : '#F4F7FB',
            width: 280,
          },
          sceneContainerStyle: {
            backgroundColor: dark ? '#0F1419' : '#F4F7FB',
          },
        };
      }}
      drawerContent={(props) => (
        <DrawerItems props={props} onLogout={onLogout} userRole={userRole} />
      )}
    >
      <Drawer.Screen name="MainTabs" options={{ title: t('operator') }}>
        {() => <MainTabs token={token} userRole={userRole} />}
      </Drawer.Screen>
      <Drawer.Screen name="face" options={{ title: t('face') }}>
        {() => <FaceScreen token={token} onToken={onToken} />}
      </Drawer.Screen>
      <Drawer.Screen name="config" options={{ title: t('config') }}>
        {() =>
          userRole && canAccessAppRoute(userRole, 'config') ? (
            <ConfigScreen token={token} />
          ) : (
            <AccessDeniedScreen detail="Config is for supervisors and administrators." />
          )
        }
      </Drawer.Screen>
      <Drawer.Screen name="audit" options={{ title: t('audit') }}>
        {() =>
          userRole && canAccessAppRoute(userRole, 'audit') ? (
            <AuditScreen token={token} />
          ) : (
            <AccessDeniedScreen detail="The audit log is limited to supervisors and administrators." />
          )
        }
      </Drawer.Screen>
      <Drawer.Screen
        name="changePassword"
        options={{ title: 'Change password' }}
      >
        {({ navigation }) => (
          <ChangePasswordScreen
            token={token}
            onClose={() => navigation.navigate('MainTabs')}
          />
        )}
      </Drawer.Screen>
    </Drawer.Navigator>
  );
}
