import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import { useQuery } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Mic, QrCode, Scan } from 'lucide-react-native';
import { canManageScanCodes, type UserRole } from '@tele-pendant/shared';
import { apiGet, apiPost } from '../api';
import { useLocale } from '../locale';
import type { RootDrawerParamList } from '../navigation';
import { HelpTip } from '../tour';
import { getStoredUserRole } from '../user-session';
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
const CAMERA_PREVIEW_HEIGHT = 220;

const cameraPreviewStyle = StyleSheet.create({
  frame: {
    width: Dimensions.get('window').width - 32,
    height: CAMERA_PREVIEW_HEIGHT,
    alignSelf: 'center',
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
});

type ScanCodeRow = {
  code: string;
  label: string;
  routeHint?: string | null;
};

function routeHintToTarget(hint: string): {
  kind: 'tab' | 'drawer';
  name: string;
} | null {
  const path = hint.replace(/^\//, '').split('?')[0]?.toLowerCase() ?? '';
  if (
    path === 'operator' ||
    path === 'ops' ||
    path === 'media' ||
    path === 'assistant'
  ) {
    return { kind: 'tab', name: path };
  }
  if (
    path === 'face' ||
    path === 'config' ||
    path === 'audit' ||
    path === 'admin'
  ) {
    return { kind: 'drawer', name: path === 'admin' ? 'config' : path };
  }
  return null;
}

export function MediaScreen({ token }: { token: string }) {
  const { t } = useLocale();
  const isFocused = useIsFocused();
  const navigation = useNavigation<DrawerNavigationProp<RootDrawerParamList>>();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [voice, setVoice] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const lastCode = useRef('');
  const deadmanPulseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadmanHoldUntilRef = useRef(0);
  const [permission, requestPermission] = useCameraPermissions();

  const codes = useQuery({
    queryKey: ['scan-codes', token],
    queryFn: () => apiGet<ScanCodeRow[]>('/media/codes', token),
  });

  useEffect(() => {
    void getStoredUserRole().then(setUserRole);
  }, [token]);

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
    }
    deadmanPulseRef.current = null;
    deadmanHoldUntilRef.current = 0;
    releaseDeadman();
  }, [releaseDeadman]);

  const startDeadmanHold = useCallback(
    (durationMs?: number) => {
      void apiPost('/safety/control/claim', undefined, token).catch(
        () => undefined,
      );
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

  function followRouteHint(hint?: string | null) {
    if (!hint?.trim()) return;
    const target = routeHintToTarget(hint.trim());
    if (!target) return;
    if (target.kind === 'tab') {
      navigation.navigate('MainTabs', {
        screen: target.name as 'operator' | 'ops' | 'media' | 'assistant',
      });
      return;
    }
    navigation.navigate(target.name as 'face' | 'config' | 'audit');
  }

  async function resolve(value: string) {
    setResult(null);
    try {
      const row = await apiPost<{ label: string; routeHint?: string | null }>(
        '/media/codes/resolve',
        { code: value },
        token,
      );
      setResult(`Resolved: ${row.label}${row.routeHint ? ` (${value})` : ''}`);
      followRouteHint(row.routeHint);
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

  const canEditCodes = userRole != null && canManageScanCodes(userRole);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-4 pb-12"
    >
      <HelpTip id="tour.media.qr">
        <>
          <Section>{t('qrTitle')}</Section>
          <Hint>
            Type a known code (demo: TP-CRANE-DEMO-01) or pick one below, then
            Resolve.
          </Hint>
          <Field label="Code" value={code} onChangeText={setCode} />
          <Btn disabled={!code.trim()} onPress={() => void resolve(code)}>
            <QrCode size={16} color="#041018" />
            <BtnText>Resolve</BtnText>
          </Btn>
          {(codes.data ?? []).length > 0 ? (
            <View className="mt-3 gap-1.5">
              <Text className="text-sm font-semibold text-foreground">
                Known codes
              </Text>
              {(codes.data ?? []).map((row) => (
                <Pressable
                  key={row.code}
                  accessibilityRole="button"
                  className="min-h-[44px] rounded-md border border-border bg-card px-3 py-2"
                  onPress={() => {
                    setCode(row.code);
                    void resolve(row.code);
                  }}
                >
                  <Text className="text-sm font-medium text-foreground">
                    {row.label}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {row.code}
                    {row.routeHint ? ` → ${row.routeHint}` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {canEditCodes ? (
            <Pressable
              accessibilityRole="button"
              className="mt-2"
              onPress={() => navigation.navigate('config')}
            >
              <Text className="text-sm text-primary">
                Add or edit codes in Config
              </Text>
            </Pressable>
          ) : null}
        </>
      </HelpTip>
      <HelpTip id="tour.media.camera">
        <>
          {scanning && permission?.granted && isFocused ? (
            <View style={cameraPreviewStyle.frame} collapsable={false}>
              <CameraView
                style={cameraPreviewStyle.camera}
                facing="back"
                active={scanning && isFocused}
                barcodeScannerSettings={{
                  barcodeTypes: ['qr', 'code128', 'ean13'],
                }}
                onBarcodeScanned={({ data }) => {
                  if (data === lastCode.current) return;
                  lastCode.current = data;
                  setCode(data);
                  void resolve(data);
                }}
                onMountError={(event) => {
                  showErrorAlert(
                    event.message || 'Camera failed to start',
                    'Camera',
                  );
                  setScanning(false);
                }}
              />
            </View>
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
          <Hint>
            {t('phoneVoiceHint')} Timed up/down needs Allow timed media motion
            in Config › Safety roles and an active deadman (Listen holds it).
          </Hint>
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
