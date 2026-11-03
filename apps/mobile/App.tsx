import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
} from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LogIn, ScanFace } from 'lucide-react-native';
import type { Locale } from '@tele-pendant/shared';
import { apiGet, apiPost } from './src/api';
import { BrandMark } from './src/brand';
import { LocaleProvider, useLocale } from './src/locale';
import { AppShell } from './src/navigation';
import { FaceChallenge } from './src/screens/FaceChallenge';
import { onUnauthorized } from './src/session';
import { BootSplash } from './src/splash';
import { HelpTip, TourBar, TourProvider } from './src/tour';
import { ThemeProvider, ThemeToggle, useTheme } from './src/theme';
import {
  Btn,
  BtnText,
  ErrorText,
  Field,
  Hint,
  SelectField,
  Subtitle,
  Title,
} from './src/ui';

const queryClient = new QueryClient();
const SPLASH_MIN_MS = 1600;

function LoginScreen({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const { t, setLocale, locale } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'password' | 'face'>('password');

  const login = async () => {
    setError(null);
    try {
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
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-12"
        keyboardShouldPersistTaps="handled"
      >
        <View className="mb-2 mt-2 flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <BrandMark size={44} />
            <Title>Tele-Pendant</Title>
          </View>
          <ThemeToggle />
        </View>
        <Subtitle>Expo handheld · sign in to the configured API</Subtitle>
        <TourBar screen="login" />

        {mode === 'face' ? (
          <>
            <Hint>
              Local face login (3 poses). Not ISO-certified. Fail closed to
              password.
            </Hint>
            <FaceChallenge
              token=""
              onToken={onLoggedIn}
              active
              allowEnroll={false}
              allowLogin
              autoStartLogin
            />
            <Btn onPress={() => setMode('password')}>
              <LogIn size={16} color="#041018" />
              <BtnText>{t('signIn')}</BtnText>
            </Btn>
          </>
        ) : (
          <>
            <HelpTip id="tour.login.language">
              <SelectField<Locale>
                label={t('language')}
                value={locale}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'es', label: 'Español' },
                  { value: 'fr', label: 'Français' },
                  { value: 'de', label: 'Deutsch' },
                ]}
                onChange={setLocale}
              />
            </HelpTip>
            <HelpTip id="tour.login.email">
              <Field
                label={t('email')}
                value={email}
                onChangeText={setEmail}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                keyboardType="email-address"
              />
            </HelpTip>
            <HelpTip id="tour.login.password">
              <Field
                label={t('password')}
                value={password}
                onChangeText={setPassword}
                secure
                autoComplete="off"
                textContentType="oneTimeCode"
                importantForAutofill="no"
              />
            </HelpTip>
            {error ? <ErrorText>{error}</ErrorText> : null}
            <HelpTip id="tour.login.signIn">
              <Btn onPress={() => void login()}>
                <LogIn size={16} color="#041018" />
                <BtnText>{t('signIn')}</BtnText>
              </Btn>
            </HelpTip>
            <HelpTip id="tour.login.face">
              <Btn onPress={() => setMode('face')}>
                <ScanFace size={16} color="#041018" />
                <BtnText>{t('faceLogin')}</BtnText>
              </Btn>
            </HelpTip>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Pendant() {
  const { theme } = useTheme();
  const [token, setToken] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    void (async () => {
      try {
        const saved = await AsyncStorage.getItem('accessToken');
        if (!saved) return;
        try {
          await apiGet('/auth/me', saved);
          if (!cancelled) setToken(saved);
        } catch {
          await AsyncStorage.removeItem('accessToken');
          if (!cancelled) setToken(null);
        }
      } finally {
        const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - started));
        await new Promise((resolve) => setTimeout(resolve, wait));
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return onUnauthorized(() => {
      setToken(null);
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

  if (booting) {
    return <BootSplash />;
  }

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
