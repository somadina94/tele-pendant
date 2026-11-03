import { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowDown, ArrowUp, Mic, QrCode, Scan } from 'lucide-react-native';
import { apiPost } from '../api';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import { Btn, BtnText, Field, Hint, OkText, Row, Section } from '../ui';

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
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-4 pb-12"
    >
      <HelpTip id="tour.media.qr">
        <>
          <Section>{t('qrTitle')}</Section>
          <Field label="Code" value={code} onChangeText={setCode} />
          <Btn onPress={() => void resolve(code)}>
            <QrCode size={16} color="#041018" />
            <BtnText>Resolve</BtnText>
          </Btn>
        </>
      </HelpTip>
      <HelpTip id="tour.media.camera">
        <>
          {scanning && permission?.granted ? (
            <CameraView
              className="mb-3 h-[220px] rounded-lg"
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'code128', 'ean13'],
              }}
              onBarcodeScanned={({ data }) => {
                if (data === lastCode.current) return;
                lastCode.current = data;
                setCode(data);
                void resolve(data);
              }}
            />
          ) : null}
          <Btn
            onPress={() => {
              if (!permission?.granted) void requestPermission();
              setScanning((on) => !on);
            }}
          >
            <Scan size={16} color="#041018" />
            <BtnText>
              {scanning ? t('stopCamera') : t('scanCamera')}
            </BtnText>
          </Btn>
        </>
      </HelpTip>
      {result ? <OkText>{result}</OkText> : null}
      <HelpTip id="tour.media.voice">
        <>
          <Section>{t('voice')}</Section>
          <Hint>{t('phoneVoiceHint')}</Hint>
          <Btn onPress={() => void listen()}>
            <Mic size={16} color="#041018" />
            <BtnText>{t('listen')}</BtnText>
          </Btn>
        </>
      </HelpTip>
      <HelpTip id="tour.media.upDown">
        <Row>
          <Btn className="flex-1" onPress={() => void command('up')}>
            <ArrowUp size={16} color="#041018" />
            <BtnText>{t('up')}</BtnText>
          </Btn>
          <Btn className="flex-1" onPress={() => void command('down')}>
            <ArrowDown size={16} color="#041018" />
            <BtnText>{t('down')}</BtnText>
          </Btn>
        </Row>
      </HelpTip>
      {voice ? <OkText>{voice}</OkText> : null}
    </ScrollView>
  );
}
