import { Image, Text, View } from 'react-native';

const mark = require('../assets/icon.png');

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={mark}
      accessibilityLabel="Tele-Pendant"
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
    />
  );
}

export function BrandLockup({
  subtitle = 'HMI',
  size = 36,
}: {
  subtitle?: string;
  size?: number;
}) {
  return (
    <View className="flex-row items-center gap-2.5">
      <BrandMark size={size} />
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold tracking-wide text-foreground">
          Tele-Pendant
        </Text>
        <Text className="text-[10px] uppercase tracking-[2px] text-muted-foreground">
          {subtitle}
        </Text>
      </View>
    </View>
  );
}
