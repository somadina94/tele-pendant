import { ScrollView, Text, View } from 'react-native';
import { ShieldX } from 'lucide-react-native';
import { useTheme } from './theme';
import { Hint, Section } from './ui';

export function AccessDeniedScreen({ detail }: { detail?: string }) {
  const { theme } = useTheme();
  const iconColor = theme === 'dark' ? '#F87171' : '#DC2626';

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 p-4 pb-12"
    >
      <View className="flex-row items-center gap-2">
        <ShieldX size={22} color={iconColor} />
        <Section>Permission denied</Section>
      </View>
      <Hint>
        {detail ??
          'Your account role cannot open this screen. If you need access, ask a supervisor or administrator.'}
      </Hint>
      <Text className="text-sm text-muted-foreground">
        Use the menu to return to Operator or another allowed screen.
      </Text>
    </ScrollView>
  );
}
