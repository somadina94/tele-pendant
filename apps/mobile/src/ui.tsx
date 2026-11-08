import { useState, type ReactNode } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
} from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { useTheme } from './theme';

export function ScreenScroll({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1">
      <View className="gap-1 pb-12">{children}</View>
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text className="mb-2 mt-6 text-3xl font-bold text-foreground">
      {children}
    </Text>
  );
}

export function TitleSmall({ children }: { children: ReactNode }) {
  return <Text className="text-xl font-bold text-foreground">{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text className="mb-4 text-muted-foreground">{children}</Text>;
}

export function Section({ children }: { children: ReactNode }) {
  return (
    <Text className="mt-4 text-lg font-bold text-foreground">{children}</Text>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text className="mt-1 text-xs text-muted-foreground">{children}</Text>;
}

/** @deprecated Use showErrorAlert — inline errors shift layout on mobile. */
export function ErrorText({ children }: { children: ReactNode }) {
  return null;
}

export function errorMessage(
  err: unknown,
  fallback = 'Something went wrong',
): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

export function showErrorAlert(message: string, title = 'Error'): void {
  const body = message.trim() || 'Something went wrong';
  Alert.alert(title, body, [{ text: 'OK' }]);
}

export function showErrorFrom(
  err: unknown,
  fallback?: string,
  title = 'Error',
): void {
  showErrorAlert(errorMessage(err, fallback), title);
}

export function confirmDestructive(
  title: string,
  message: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function confirmAction(
  title: string,
  message: string,
  actionLabel: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: actionLabel, onPress: () => resolve(true) },
    ]);
  });
}

export function OkText({ children }: { children: ReactNode }) {
  return <Text className="my-2 text-success">{children}</Text>;
}

export function Banner({ children }: { children: ReactNode }) {
  return (
    <Text className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-muted-foreground">
      {children}
    </Text>
  );
}

export function LinkText({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Text className="text-primary" onPress={onPress}>
      {children}
    </Text>
  );
}

export function Btn({
  children,
  onPress,
  className = '',
  disabled,
  ...rest
}: PressableProps & { children: ReactNode; className?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 active:opacity-80 disabled:opacity-50 ${className}`}
      {...rest}
    >
      {typeof children === 'string' ? (
        <Text className="font-bold text-primary-foreground">{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function BtnText({ children }: { children: ReactNode }) {
  return <Text className="font-bold text-primary-foreground">{children}</Text>;
}

export function Field({
  label,
  value,
  onChangeText,
  secure,
  multiline,
  numberOfLines,
  compact,
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secure?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  /** Tighter vertical spacing (e.g. operator PIN row). */
  compact?: boolean;
} & Omit<TextInputProps, 'value' | 'onChangeText'>) {
  return (
    <View className={compact ? 'mb-0' : 'mb-1'}>
      <Text
        className={
          compact
            ? 'mb-0.5 mt-1 text-muted-foreground'
            : 'mb-1 mt-2 text-muted-foreground'
        }
      >
        {label}
      </Text>
      <TextInput
        className={`rounded-lg border border-border bg-input px-3 text-foreground ${
          compact ? 'py-2' : 'py-3'
        } ${multiline ? 'min-h-[96px]' : ''}`}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        autoCapitalize="none"
        placeholder={label}
        placeholderTextColor="#5C6B7A"
        multiline={multiline}
        numberOfLines={numberOfLines}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...rest}
      />
    </View>
  );
}

export function Card({
  children,
  compact,
  className = '',
}: {
  children: ReactNode;
  /** Match web operator control card padding. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <View
      className={
        compact
          ? `gap-1 rounded-xl border border-border bg-card px-2 pb-2 pt-2 ${className}`
          : `mb-3 rounded-xl border border-border bg-card p-3 ${className}`
      }
    >
      {children}
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder = 'Choose…',
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value)?.label;
  const iconColor = theme === 'dark' ? '#8B9AAB' : '#5C6B7A';
  const empty = options.length === 0;

  return (
    <View className="mb-2">
      <Text className="mb-1 text-sm text-muted-foreground">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: disabled || empty }}
        disabled={disabled || empty}
        className={`min-h-12 flex-row items-center justify-between rounded-lg border border-border bg-input px-3 py-3 ${
          disabled || empty ? 'opacity-50' : 'active:opacity-80'
        }`}
        onPress={() => setOpen(true)}
      >
        <Text
          className="flex-1 pr-2 text-base text-foreground"
          numberOfLines={1}
        >
          {empty ? 'No options loaded' : (selected ?? placeholder)}
        </Text>
        <ChevronDown size={18} color={iconColor} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/55">
          <Pressable
            accessibilityLabel="Close"
            className="flex-1"
            onPress={() => setOpen(false)}
          />
          <View className="max-h-[75%] rounded-t-2xl border border-border bg-card pb-6">
            <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <Text className="text-lg font-semibold text-foreground">
                {label}
              </Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Text className="text-base text-primary">Done</Text>
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={`${option.value}-${option.label}`}
                    className={`border-b border-border/40 px-4 py-3.5 ${
                      active ? 'bg-muted' : ''
                    }`}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Text
                      className={
                        active
                          ? 'text-base font-semibold text-foreground'
                          : 'text-base text-muted-foreground'
                      }
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
