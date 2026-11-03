import { Image, StyleSheet, View } from 'react-native';

const splashArt = require('../assets/splash.png');

export function BootSplash() {
  return (
    <View style={styles.root} accessibilityLabel="Tele-Pendant splash">
      <Image source={splashArt} style={styles.image} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#07090c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
