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
import { LogIn, ScanFace } from 'lucide-react-native';
import type { Locale, UserRole } from '@tele-pendant/shared';
import { isUserRole } from '@tele-pendant/shared';
import { apiGet, apiPost } from './src/api';
import {
  clearStoredUser,
  getStoredUserRole,
  persistUser,
  type StoredUser,
} from './src/user-session';
import { BrandMark } from './src/brand';
import { LocaleProvider, useLocale } from './src/locale';
import { AppShell } from './src/navigation';
import type { Layout } from './src/types';
import { FaceChallenge } from './src/screens/FaceChallenge';
import { onUnauthorized } from './src/session';
import { BootSplash } from './src/splash';
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from './src/token-storage';
import { HelpTip, TourBar, TourProvider } from './src/tour';
import { ThemeProvider, ThemeToggle, useTheme } from './src/theme';
import {
  Btn,
  BtnText,
  Field,
  showErrorFrom,
  Hint,
  SelectField,
  Subtitle,
  Title,
} from './src/ui';

const queryClient = new QueryClient();
const SPLASH_MIN_MS = 1600;

function LoginScreen({
  onLoggedIn,
}: {
  onLoggedIn: (token: string, role: UserRole | null) => void;
}) {
  const { t, setLocale, locale } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [otpEmailHint, setOtpEmailHint] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [mode, setMode] = useState<'password' | 'face'>('password');

  const finish = async (accessToken: string, user: StoredUser) => {
    await setAccessToken(accessToken);
    await persistUser(user);
    onLoggedIn(accessToken, isUserRole(user.role) ? user.role : null);
  };

  const login = async () => {
    try {
      if (otpChallengeId) {
        const data = await apiPost<{
          accessToken: string;
          user: StoredUser;
        }>('/auth/login/otp', {
          challengeId: otpChallengeId,
          code: otpCode.trim(),
        });
        await finish(data.accessToken, data.user);
        return;
      }
      const data = await apiPost<{
        accessToken?: string;
        user?: StoredUser;
        requiresTwoFactor?: true;
        challengeId?: string;
        emailHint?: string;
      }>('/auth/login', {
        email,
        password,
      });
      if (data.requiresTwoFactor && data.challengeId) {
        setOtpChallengeId(data.challengeId);
        setOtpEmailHint(data.emailHint ?? email);
        setOtpCode('');
        return;
      }
      if (!data.accessToken || !data.user) {
        throw new Error(t('loginFailed'));
      }
      await finish(data.accessToken, data.user);
    } catch (err) {
      showErrorFrom(err, 'Login failed', t('signIn'));
    }
  };

  const resendOtp = async () => {
    if (!otpChallengeId) return;
    try {
      const data = await apiPost<{
        challengeId: string;
        emailHint: string;
      }>('/auth/login/otp/resend', { challengeId: otpChallengeId });
      setOtpChallengeId(data.challengeId);
      setOtpEmailHint(data.emailHint);
      setOtpCode('');
    } catch (err) {
      showErrorFrom(err, 'Login failed', t('signIn'));
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

        {otpChallengeId ? (
          <>
            <Hint>{t('otpLede').replace('{email}', otpEmailHint)}</Hint>
            <Field
              label={t('otpCode')}
              value={otpCode}
              onChangeText={setOtpCode}
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
            />
            <Btn onPress={() => void login()}>
              <LogIn size={16} color="#041018" />
              <BtnText>{t('otpVerify')}</BtnText>
            </Btn>
            <Btn onPress={() => void resendOtp()}>
              <BtnText>{t('otpResend')}</BtnText>
            </Btn>
            <Btn
              onPress={() => {
                setOtpChallengeId(null);
                setOtpCode('');
              }}
            >
              <BtnText>{t('otpBack')}</BtnText>
            </Btn>
          </>
        ) : mode === 'face' ? (
          <>
            <Hint>
              Local face login (3 poses). Not ISO-certified. Fail closed to
              password.
            </Hint>
            <FaceChallenge
              token=""
              onToken={(accessToken) => {
                void (async () => {
                  try {
                    const me = await apiGet<StoredUser>(
                      '/auth/me',
                      accessToken,
                    );
                    await persistUser(me);
                    onLoggedIn(
                      accessToken,
                      isUserRole(me.role) ? me.role : null,
                    );
                  } catch {
                    onLoggedIn(accessToken, null);
                  }
                })();
              }}
              onOtpChallenge={(challengeId, emailHint) => {
                setOtpChallengeId(challengeId);
                setOtpEmailHint(emailHint);
                setOtpCode('');
                setMode('password');
              }}
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
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    void (async () => {
      try {
        const saved = await getAccessToken();
        if (!saved) return;
        try {
          const me = await apiGet<StoredUser>('/auth/me', saved);
          await persistUser(me);
          if (!cancelled) {
            setToken(saved);
            setUserRole(isUserRole(me.role) ? me.role : null);
          }
        } catch {
          await clearAccessToken();
          await clearStoredUser();
          if (!cancelled) {
            setToken(null);
            setUserRole(null);
          }
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

  useEffect(() => {
    if (!token) return;
    void queryClient.prefetchQuery({
      queryKey: ['layout', token],
      queryFn: () => apiGet<Layout>('/hmi/layout', token),
    });
  }, [token]);

  const logout = async () => {
    const current = token;
    if (current) {
      try {
        await apiPost('/auth/logout', undefined, current);
      } catch {
        /* still clear local session */
      }
    }
    await clearAccessToken();
    await clearStoredUser();
    setToken(null);
    setUserRole(null);
  };

  const onLoggedIn = (nextToken: string, role: UserRole | null) => {
    setToken(nextToken);
    setUserRole(role);
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
    return <LoginScreen onLoggedIn={onLoggedIn} />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      <AppShell
        token={token}
        userRole={userRole}
        onLogout={() => void logout()}
        onToken={(next) => {
          setToken(next);
          void getStoredUserRole().then(setUserRole);
        }}
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
