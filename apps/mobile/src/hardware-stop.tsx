import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Shown when the API cannot be reached. Software STOP cannot drive the PLC. */
export function HardwareStopNotice() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center gap-4 px-6">
        <View className="h-16 items-center justify-center rounded-md bg-red-700 opacity-50">
          <Text className="text-lg font-bold text-white">STOP</Text>
        </View>
        <Text className="text-lg font-semibold text-foreground">
          Use the hardware e-stop
        </Text>
        <Text className="text-muted-foreground">
          Software STOP cannot reach the PLC while the API is down.
        </Text>
      </View>
    </SafeAreaView>
  );
}
