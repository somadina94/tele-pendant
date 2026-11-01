import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { apiPost } from '../api';
import { useLocale } from '../locale';
import { Field, styles } from '../ui';

export function MediaScreen({ token }: { token: string }) {
  const { t } = useLocale();
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

  async function command(transcript: string) {
    setVoice(`Heard: ${transcript}`);
    try {
      const res = await apiPost<{
        ok: boolean;
        label?: string;
        reason?: string;
      }>('/media/voice', { transcript }, token);
      setVoice(
        res.ok
          ? `Heard: ${transcript}. Executed: ${res.label}`
          : `Heard: ${transcript}. Not executed: ${res.reason ?? 'unknown'}`,
      );
    } catch (err) {
      setVoice(
        `Heard: ${transcript}. Not executed: ${
          err instanceof Error ? err.message : 'failed'
        }`,
      );
    }
  }

  async function listen() {
    try {
      const speech = (await import('expo-speech-recognition')) as {
        ExpoSpeechRecognitionModule: {
          requestPermissionsAsync: () => Promise<{ granted: boolean }>;
          start: (options: { lang: string; interimResults: boolean }) => void;
          stop: () => void;
          addListener: (
            event: 'result',
            listener: (event: {
              results?: Array<{ transcript?: string }>;
            }) => void,
          ) => { remove: () => void };
        };
      };
      const recognition = speech.ExpoSpeechRecognitionModule;
      const permission = await recognition.requestPermissionsAsync();
      if (!permission.granted) {
        setVoice('Microphone permission denied. Use UP or DOWN.');
        return;
      }
      const sub = recognition.addListener('result', (event) => {
        const transcript = event.results?.[0]?.transcript ?? '';
        sub.remove();
        recognition.stop();
        if (transcript) void command(transcript);
      });
      recognition.start({ lang: 'en-US', interimResults: false });
      setVoice('Listening…');
    } catch {
      setVoice(
        'Listen needs a local debug build (npx expo run:android). Use UP or DOWN.',
      );
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.section}>{t('qrTitle')}</Text>
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
          {scanning ? t('stopCamera') : t('scanCamera')}
        </Text>
      </Pressable>
      {result ? <Text style={styles.ok}>{result}</Text> : null}
      <Text style={styles.section}>{t('voice')}</Text>
      <Text style={styles.hint}>{t('phoneVoiceHint')}</Text>
      <Pressable style={styles.btn} onPress={() => void listen()}>
        <Text style={styles.btnText}>{t('listen')}</Text>
      </Pressable>
      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={() => void command('up')}>
          <Text style={styles.btnText}>{t('up')}</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => void command('down')}>
          <Text style={styles.btnText}>{t('down')}</Text>
        </Pressable>
      </View>
      {voice ? <Text style={styles.ok}>{voice}</Text> : null}
    </ScrollView>
  );
}
