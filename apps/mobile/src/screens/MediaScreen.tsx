import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Mic, QrCode, Scan } from 'lucide-react-native';
import { apiPost } from '../api';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import {
  Btn,
  BtnText,
  Field,
  Hint,
  OkText,
  Section,
  showErrorAlert,
  showErrorFrom,
} from '../ui';

/** Keep deadman pulsed through a short timed voice jog (matches API VOICE_JOG_MS). */
const VOICE_DEADMAN_HOLD_MS = 2500;
const VOICE_DEADMAN_PULSE_MS = 400;

export function MediaScreen({ token }: { token: string }) {
  const { t } = useLocale();
  const isFocused = useIsFocused();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [voice, setVoice] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const lastCode = useRef('');
  const deadmanPulseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadmanHoldUntilRef = useRef(0);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (!isFocused && scanning) setScanning(false);
  }, [isFocused, scanning]);

  const releaseDeadman = useCallback(() => {
    void apiPost('/safety/deadman/release', undefined, token).catch(
      () => undefined,
    );
  }, [token]);

  const stopDeadmanHold = useCallback(() => {
    if (deadmanPulseRef.current) {
      clearInterval(deadmanPulseRef.current);
      deadmanPulseRef.current = null;
    }
    deadmanHoldUntilRef.current = 0;
    releaseDeadman();
  }, [releaseDeadman]);

  const startDeadmanHold = useCallback(
    (durationMs?: number) => {
      void apiPost('/safety/deadman/pulse', undefined, token).catch(
        () => undefined,
      );
      if (durationMs != null) {
        deadmanHoldUntilRef.current = Date.now() + durationMs;
      } else {
        deadmanHoldUntilRef.current = 0;
      }
      if (deadmanPulseRef.current) return;
      deadmanPulseRef.current = setInterval(() => {
        if (
          deadmanHoldUntilRef.current > 0 &&
          Date.now() >= deadmanHoldUntilRef.current
        ) {
          stopDeadmanHold();
          return;
        }
        void apiPost('/safety/deadman/pulse', undefined, token).catch(
          () => undefined,
        );
      }, VOICE_DEADMAN_PULSE_MS);
    },
    [stopDeadmanHold, token],
  );

  useEffect(() => {
    return () => {
      if (deadmanPulseRef.current) clearInterval(deadmanPulseRef.current);
    };
  }, []);

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
      showErrorFrom(err, 'Resolve failed', 'Media');
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
      if (res.ok) {
        setVoice(`Heard: ${transcript}. Executed: ${res.label}`);
        if (/stop/i.test(res.label ?? '')) stopDeadmanHold();
        else startDeadmanHold(VOICE_DEADMAN_HOLD_MS);
      } else {
        stopDeadmanHold();
        showErrorAlert(
          `Not executed: ${res.reason ?? 'unknown'}`,
          'Voice command',
        );
        setVoice(`Heard: ${transcript}`);
      }
    } catch (err) {
      stopDeadmanHold();
      showErrorFrom(err, 'Voice command failed', 'Media');
      setVoice(transcript ? `Heard: ${transcript}` : null);
    }
  }

  async function requestCameraAccess(): Promise<boolean> {
    const result = await requestPermission();
    if (result.granted) {
      setCameraBlocked(false);
      return true;
    }
    const msg =
      result.canAskAgain === false
        ? t('cameraPermissionBlocked')
        : t('cameraPermissionDenied');
    setCameraBlocked(result.canAskAgain === false);
    showErrorAlert(msg, 'Camera');
    return false;
  }

  async function toggleScanning() {
    if (scanning) {
      setScanning(false);
      return;
    }
    const ok = await requestCameraAccess();
    if (ok) setScanning(true);
  }

  async function listen() {
    setVoice(null);
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
        showErrorAlert('Microphone permission denied.', 'Listen');
        return;
      }
      // TP-29: Listen itself is the deadman hold for timed voice motion.
      startDeadmanHold();
      const sub = recognition.addListener('result', (event) => {
        const transcript = event.results?.[0]?.transcript?.trim() ?? '';
        sub.remove();
        recognition.stop();
        if (transcript) {
          void command(transcript);
        } else {
          stopDeadmanHold();
          setVoice('Nothing heard.');
        }
      });
      recognition.start({ lang: 'en-US', interimResults: false });
      setVoice('Listening…');
    } catch {
      stopDeadmanHold();
      showErrorAlert(
        'Listen needs a local debug build (npx expo run:android).',
        'Listen',
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
          <Btn disabled={!code.trim()} onPress={() => void resolve(code)}>
            <QrCode size={16} color="#041018" />
            <BtnText>Resolve</BtnText>
          </Btn>
        </>
      </HelpTip>
      <HelpTip id="tour.media.camera">
        <>
          {scanning && permission?.granted && isFocused ? (
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
          {cameraBlocked || (permission && !permission.granted) ? (
            <View className="mb-3 gap-2">
              {permission?.canAskAgain === false ? (
                <Btn onPress={() => void Linking.openSettings()}>
                  <Scan size={16} color="#041018" />
                  <BtnText>{t('openAppSettings')}</BtnText>
                </Btn>
              ) : (
                <Btn
                  onPress={() =>
                    void requestCameraAccess().then(
                      (ok) => ok && setScanning(true),
                    )
                  }
                >
                  <Scan size={16} color="#041018" />
                  <BtnText>{t('retryCamera')}</BtnText>
                </Btn>
              )}
            </View>
          ) : null}
          <Btn onPress={() => void toggleScanning()}>
            <Scan size={16} color="#041018" />
            <BtnText>{scanning ? t('stopCamera') : t('scanCamera')}</BtnText>
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
      {voice ? <OkText>{voice}</OkText> : null}
    </ScrollView>
  );
}
