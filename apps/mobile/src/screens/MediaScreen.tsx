import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { apiPost } from '../api';
import { Field, styles } from '../ui';

export function MediaScreen({ token }: { token: string }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [voice, setVoice] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const lastCode = useRef('');
  const [permission, requestPermission] = useCameraPermissions();

  async function resolve(value: string) {
    setResult(null);
    try {
      const row = await apiPost<{ label: string; routeHint?: string | null }>(
        '/media/codes/resolve',
        { code: value },
        token,
      );
      setResult(`${row.label}${row.routeHint ? ` · ${row.routeHint}` : ''}`);
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Resolve failed');
    }
  }

  async function command(direction: 'up' | 'down') {
    setVoice(`Heard: ${direction}`);
    try {
      const res = await apiPost<{
        ok: boolean;
        label?: string;
        reason?: string;
      }>('/media/voice', { transcript: direction }, token);
      setVoice(
        res.ok
          ? `Heard: ${direction}. Executed: ${res.label}`
          : `Heard: ${direction}. Not executed: ${res.reason ?? 'unknown'}`,
      );
    } catch (err) {
      setVoice(
        `Heard: ${direction}. Not executed: ${
          err instanceof Error ? err.message : 'failed'
        }`,
      );
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.section}>QR / barcode</Text>
      <Field label="Code" value={code} onChangeText={setCode} />
      <Pressable style={styles.btn} onPress={() => void resolve(code)}>
        <Text style={styles.btnText}>Resolve</Text>
      </Pressable>
      {scanning && permission?.granted ? (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13'] }}
          onBarcodeScanned={({ data }) => {
            if (data === lastCode.current) return;
            lastCode.current = data;
            setCode(data);
            void resolve(data);
          }}
        />
      ) : null}
      <Pressable
        style={styles.btn}
        onPress={() => {
          if (!permission?.granted) void requestPermission();
          setScanning((on) => !on);
        }}
      >
        <Text style={styles.btnText}>
          {scanning ? 'Stop camera' : 'Scan with camera'}
        </Text>
      </Pressable>
      {result ? <Text style={styles.ok}>{result}</Text> : null}
      <Text style={styles.section}>Voice</Text>
      <Text style={styles.hint}>
        Device listen stays on the web. This phone has no Web Speech API, so it
        only sends the UP and DOWN words.
      </Text>
      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={() => void command('up')}>
          <Text style={styles.btnText}>UP</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => void command('down')}>
          <Text style={styles.btnText}>DOWN</Text>
        </Pressable>
      </View>
      {voice ? <Text style={styles.ok}>{voice}</Text> : null}
    </ScrollView>
  );
}
