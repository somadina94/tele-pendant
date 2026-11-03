import {
  Pressable,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
} from 'react-native';
import type { ReactNode } from 'react';

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

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text className="my-2 text-destructive">{children}</Text>;
}

export function OkText({ children }: { children: ReactNode }) {
  return <Text className="my-2 text-success">{children}</Text>;
}

export function Banner({ children }: { children: ReactNode }) {
  return (
    <Text className="mb-3 rounded-lg border border-border bg-card p-2.5 text-muted-foreground">
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
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secure?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
} & Omit<TextInputProps, 'value' | 'onChangeText'>) {
  return (
    <View className="mb-1">
      <Text className="mb-1 mt-2 text-muted-foreground">{label}</Text>
      <TextInput
        className={`rounded-lg border border-border bg-input px-3 py-3 text-foreground ${
          multiline ? 'min-h-[96px]' : ''
        }`}
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

export function Card({ children }: { children: ReactNode }) {
  return (
    <View className="mb-3 rounded-xl border border-border bg-card p-3">
      {children}
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}
