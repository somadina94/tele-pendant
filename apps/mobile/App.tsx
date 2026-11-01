import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiPost, getApiBase } from './src/api';
import { AuditScreen } from './src/screens/AuditScreen';
import { ConfigScreen } from './src/screens/ConfigScreen';
import { FaceScreen } from './src/screens/FaceScreen';
import { MediaScreen } from './src/screens/MediaScreen';
import { OperatorScreen } from './src/screens/OperatorScreen';
import { OpsScreen } from './src/screens/OpsScreen';
import type { ScreenName } from './src/types';
import { LocaleProvider, useLocale } from './src/locale';
import { Field, styles } from './src/ui';

const queryClient = new QueryClient();

const NAV: Array<{ id: ScreenName; label: string }> = [
  { id: 'operator', label: 'Operator' },
  { id: 'media', label: 'Media' },
  { id: 'face', label: 'Face' },
  { id: 'ops', label: 'Ops' },
  { id: 'config', label: 'Config' },
  { id: 'audit', label: 'Audit' },
];

function Pendant() {
  const { t, setLocale, locale } = useLocale();
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('change-me-admin-password');
  const [apiBase, setApiBase] = useState('http://127.0.0.1:3010/api/v1');
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenName>('operator');

  useEffect(() => {
    void (async () => {
      const saved = await AsyncStorage.getItem('accessToken');
      const base = await getApiBase();
      setApiBase(base);
      if (saved) setToken(saved);
    })();
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
      setToken(data.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('accessToken');
    setToken(null);
    setScreen('operator');
  };

  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Tele-Pendant</Text>
        <Text style={styles.sub}>
          Expo handheld · set API base for device/LAN
        </Text>
        <Field
          label={t('language')}
          value={locale}
          onChangeText={(value) => setLocale(value === 'es' ? 'es' : 'en')}
        />
        <Field label="API base" value={apiBase} onChangeText={setApiBase} />
        <Field label={t('email')} value={email} onChangeText={setEmail} />
        <Field
          label={t('password')}
          value={password}
          onChangeText={setPassword}
          secure
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.btn} onPress={() => void login()}>
          <Text style={styles.btnText}>{t('signIn')}</Text>
        </Pressable>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.titleSmall}>Tele-Pendant</Text>
        <Pressable onPress={() => void logout()}>
          <Text style={styles.link}>{t('logout')}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal contentContainerStyle={styles.nav}>
        {NAV.map((item) => (
          <Pressable key={item.id} onPress={() => setScreen(item.id)}>
            <Text style={styles.link}>{t(item.id)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {screen === 'operator' ? <OperatorScreen token={token} /> : null}
      {screen === 'media' ? <MediaScreen token={token} /> : null}
      {screen === 'face' ? (
        <FaceScreen token={token} onToken={setToken} />
      ) : null}
      {screen === 'ops' ? <OpsScreen token={token} /> : null}
      {screen === 'config' ? <ConfigScreen token={token} /> : null}
      {screen === 'audit' ? <AuditScreen token={token} /> : null}
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <LocaleProvider>
            <Pendant />
          </LocaleProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
