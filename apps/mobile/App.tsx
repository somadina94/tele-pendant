import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
} from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LogIn } from 'lucide-react-native';
import { apiPost, getApiBase } from './src/api';
import { LocaleProvider, useLocale } from './src/locale';
import { AppShell } from './src/navigation';
import { HelpTip, TourBar, TourProvider } from './src/tour';
import { ThemeProvider, ThemeToggle, useTheme } from './src/theme';
import { Btn, BtnText, ErrorText, Field, Subtitle, Title } from './src/ui';

const queryClient = new QueryClient();

function LoginScreen({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const { t, setLocale, locale } = useLocale();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('change-me-admin-password');
  const [apiBase, setApiBase] = useState('http://127.0.0.1:3010/api/v1');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getApiBase().then(setApiBase);
  }, []);

  const login = async () => {
    setError(null);
    try {
      await AsyncStorage.setItem('apiBase', apiBase);
      const data = await apiPost<{ accessToken: string }>('/auth/login', {
        email,
        password,
      });
      await AsyncStorage.setItem('accessToken', data.accessToken);
      onLoggedIn(data.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background px-4">
      <View className="mb-2 mt-2 flex-row items-center justify-between">
        <Title>Tele-Pendant</Title>
        <ThemeToggle />
      </View>
      <Subtitle>Expo handheld · set API base for device/LAN</Subtitle>
      <TourBar screen="login" />
      <HelpTip id="tour.login.language">
        <Field
          label={t('language')}
          value={locale}
          onChangeText={(value) => setLocale(value === 'es' ? 'es' : 'en')}
        />
      </HelpTip>
      <Field label="API base" value={apiBase} onChangeText={setApiBase} />
      <HelpTip id="tour.login.email">
        <Field label={t('email')} value={email} onChangeText={setEmail} />
      </HelpTip>
      <HelpTip id="tour.login.password">
        <Field
          label={t('password')}
          value={password}
          onChangeText={setPassword}
          secure
        />
      </HelpTip>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <HelpTip id="tour.login.signIn">
        <Btn onPress={() => void login()}>
          <LogIn size={16} color="#041018" />
          <BtnText>{t('signIn')}</BtnText>
        </Btn>
      </HelpTip>
    </SafeAreaView>
  );
}

function Pendant() {
  const { theme } = useTheme();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem('accessToken').then((saved) => {
      if (saved) setToken(saved);
    });
  }, []);

  const logout = async () => {
    await AsyncStorage.removeItem('accessToken');
    setToken(null);
  };

  const navTheme =
    theme === 'dark'
      ? {
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            primary: '#3D9CFD',
            background: '#0F1419',
            card: '#161D27',
            text: '#E8EEF4',
            border: '#2A3A4D',
          },
        }
      : {
          ...DefaultTheme,
          colors: {
            ...DefaultTheme.colors,
            primary: '#3D9CFD',
            background: '#F4F7FB',
            card: '#FFFFFF',
            text: '#0F1419',
            border: '#C5D0DC',
          },
        };

  if (!token) {
    return <LoginScreen onLoggedIn={setToken} />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      <AppShell
        token={token}
        onLogout={() => void logout()}
        onToken={setToken}
      />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <LocaleProvider>
              <TourProvider>
                <Pendant />
              </TourProvider>
            </LocaleProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
