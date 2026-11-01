import { StyleSheet, Text, TextInput, View } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1419',
    padding: 16,
  },
  scroll: { paddingBottom: 48 },
  title: {
    color: '#E8EEF4',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 24,
  },
  titleSmall: { color: '#E8EEF4', fontSize: 22, fontWeight: '700' },
  sub: { color: '#8B9AAB', marginBottom: 16 },
  label: { color: '#8B9AAB', marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: '#161D27',
    borderColor: '#2A3A4D',
    borderWidth: 1,
    borderRadius: 8,
    color: '#E8EEF4',
    padding: 12,
    marginBottom: 10,
  },
  btn: {
    backgroundColor: '#3D9CFD',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#041018', fontWeight: '700' },
  error: { color: '#FF5C5C', marginVertical: 8 },
  ok: { color: '#3DD68C', marginVertical: 8 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  nav: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  link: { color: '#3D9CFD' },
  banner: {
    color: '#8B9AAB',
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A3A4D',
  },
  matrix: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    minHeight: 88,
    backgroundColor: '#1C3A5C',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2F6AA8',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  estop: { backgroundColor: '#5A1D1D', borderColor: '#C44' },
  holding: { borderColor: '#3DD68C', borderWidth: 2 },
  cellText: { color: '#E8EEF4', fontWeight: '700', textAlign: 'center' },
  empty: { minHeight: 88 },
  hint: { color: '#8B9AAB', marginTop: 16, fontSize: 12 },
  section: { color: '#E8EEF4', fontSize: 18, fontWeight: '700', marginTop: 16 },
  row: { flexDirection: 'row', gap: 8 },
  camera: { height: 220, borderRadius: 8, marginBottom: 12 },
  graphic: {
    minHeight: 180,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  graphicPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  overlay: { position: 'absolute' },
});

export function Field({
  label,
  value,
  onChangeText,
  secure,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secure?: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        autoCapitalize="none"
        placeholder={label}
        placeholderTextColor="#5C6B7A"
      />
    </View>
  );
}
