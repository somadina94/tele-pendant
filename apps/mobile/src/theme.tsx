import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Moon, Sun } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

const STORAGE_KEY = 'colorScheme';

export type AppTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { setColorScheme } = useColorScheme();
  const [theme, setThemeState] = useState<AppTheme>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const next: AppTheme =
        saved === 'light' || saved === 'dark'
          ? saved
          : Appearance.getColorScheme() === 'light'
            ? 'light'
            : 'dark';
      setThemeState(next);
      setColorScheme(next);
      setReady(true);
    })();
  }, [setColorScheme]);

  const setTheme = useCallback(
    (next: AppTheme) => {
      setThemeState(next);
      setColorScheme(next);
      void AsyncStorage.setItem(STORAGE_KEY, next);
    },
    [setColorScheme],
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, ready }),
    [theme, setTheme, toggleTheme, ready],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View
        className={`flex-1 bg-background ${theme === 'dark' ? 'dark' : ''}`}
      >
        {children}
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <Pressable
      onPress={toggleTheme}
      accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="h-9 w-9 items-center justify-center rounded-md active:opacity-70"
    >
      {dark ? (
        <Sun size={18} className="text-foreground" color="#E8EEF4" />
      ) : (
        <Moon size={18} color="#0F1419" />
      )}
    </Pressable>
  );
}
