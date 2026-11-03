import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, ScanFace, UserPlus } from 'lucide-react-native';
import { apiPost } from '../api';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import {
  Btn,
  BtnText,
  ErrorText,
  Field,
  Hint,
  OkText,
  Section,
} from '../ui';

const CHALLENGE_PROMPTS = [
  'Center your face in the frame',
  'Turn your head clearly to the left (chin past center)',
  'Turn your head clearly to the right (chin past center)',
] as const;

type ChallengeMode = 'enroll' | 'login' | null;

const PREVIEW_HEIGHT = 280;

const previewStyle = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  frame: {
    width: Dimensions.get('window').width - 32,
    height: PREVIEW_HEIGHT,
    alignSelf: 'center',
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
});

export function FaceScreen({
  token,
  onToken,
}: {
  token: string;
  onToken: (token: string) => void;
}) {
  const { t, terror } = useLocale();
  const isFocused = useIsFocused();
  const camera = useRef<CameraView>(null);
  const [email, setEmail] = useState('admin@example.com');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ChallengeMode>(null);
  const [step, setStep] = useState(0);
  const [frames, setFrames] = useState<string[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!isFocused) {
      setCameraReady(false);
    }
  }, [isFocused]);

  function resetChallenge() {
    setMode(null);
    setStep(0);
    setFrames([]);
    setBusy(false);
  }

  function startChallenge(next: 'enroll' | 'login') {
    setErr(null);
    setMsg(null);
    if (next === 'enroll' && !token) {
      setErr('Sign in with password first, then enroll');
      return;
    }
    if (!permission?.granted) {
      void requestPermission().then((result) => {
        if (!result.granted) setErr('Camera permission denied');
        else {
          setMode(next);
          setStep(0);
          setFrames([]);
        }
      });
      return;
    }
    if (!cameraReady) {
      setErr('Wait for the camera preview, then start again.');
      return;
    }
    setMode(next);
    setStep(0);
    setFrames([]);
  }

  async function captureStep() {
    if (!mode || busy) return;
    if (!camera.current || !cameraReady) {
      setErr('Camera preview is opening — wait a moment, then capture.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const photo = await camera.current.takePictureAsync({
        base64: true,
        quality: 0.35,
        shutterSound: false,
      });
      if (!photo?.base64) {
        setErr('No camera snapshot');
        return;
      }
      const nextFrames = [
        ...frames,
        `data:image/jpeg;base64,${photo.base64}`,
      ];
      if (nextFrames.length < CHALLENGE_PROMPTS.length) {
        setFrames(nextFrames);
        setStep(nextFrames.length);
        setMsg(
          `Captured ${nextFrames.length}/${CHALLENGE_PROMPTS.length}. Pose for the next step, then tap Capture.`,
        );
        return;
      }
      setFrames(nextFrames);
      setMsg('Submitting challenge…');
      if (mode === 'enroll') {
        const res = await apiPost<{ limitation: string }>(
          '/auth/face/enroll',
          { frames: nextFrames },
          token,
        );
        setMsg(res.limitation);
      } else {
        const res = await apiPost<{
          accessToken: string;
          limitation: string;
        }>('/auth/face/login', { frames: nextFrames, email });
        await AsyncStorage.setItem('accessToken', res.accessToken);
        onToken(res.accessToken);
        setMsg(res.limitation);
      }
      resetChallenge();
    } catch (error) {
      setErr(
        error instanceof Error
          ? mode === 'login'
            ? terror(error.message)
            : error.message
          : mode === 'login'
            ? t('err.face')
            : 'Enroll failed',
      );
      resetChallenge();
    } finally {
      setBusy(false);
    }
  }

  const previewReady = Boolean(permission?.granted);
  const inChallenge = mode !== null;
  // Unmount when blurred — only one CameraView may be active app-wide.
  const showCamera = previewReady && isFocused;

  return (
    <View style={previewStyle.root} className="flex-1 bg-background">
      {!permission ? (
        <View className="px-4 pt-4">
          <Hint>Checking camera permission…</Hint>
        </View>
      ) : !permission.granted ? (
        <View className="gap-2 px-4 pt-4">
          <Hint>
            Camera permission is required for face preview and capture.
          </Hint>
          <Btn onPress={() => void requestPermission()}>
            <Camera size={16} color="#041018" />
            <BtnText>Allow camera</BtnText>
          </Btn>
        </View>
      ) : showCamera ? (
        <View style={previewStyle.frame} collapsable={false}>
          <CameraView
            ref={camera}
            style={previewStyle.camera}
            facing="front"
            mirror
            mode="picture"
            videoQuality="480p"
            animateShutter={false}
            active={isFocused}
            onCameraReady={() => setCameraReady(true)}
            onMountError={(event) => {
              setCameraReady(false);
              setErr(event.message || 'Camera failed to start');
            }}
          />
        </View>
      ) : (
        <View className="px-4 pt-4">
          <Hint>Open Face again to restart the camera preview.</Hint>
        </View>
      )}

      {previewReady && isFocused && !cameraReady ? (
        <View className="px-4">
          <Hint>Starting camera preview…</Hint>
        </View>
      ) : null}

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-12"
        keyboardShouldPersistTaps="handled"
      >
        <HelpTip id="tour.face.title">
          <>
            <Section>{t('faceTitle')}</Section>
            <Hint>
              Local challenge liveness (3 poses). Not ISO-certified. Fail closed
              to password. Face never authorizes e-stop or safe actions.
            </Hint>
          </>
        </HelpTip>

        {inChallenge ? (
          <>
            <Section>
              Step {step + 1}/{CHALLENGE_PROMPTS.length}
            </Section>
            <Hint>{CHALLENGE_PROMPTS[step]}</Hint>
            <Hint>
              Get ready in the preview, then tap Capture for this pose only.
            </Hint>
            <Btn
              disabled={busy || !cameraReady}
              onPress={() => void captureStep()}
            >
              <Camera size={16} color="#041018" />
              <BtnText>
                {busy
                  ? 'Working…'
                  : `Capture pose ${step + 1}/${CHALLENGE_PROMPTS.length}`}
              </BtnText>
            </Btn>
            <Btn disabled={busy} onPress={resetChallenge}>
              <BtnText>Cancel challenge</BtnText>
            </Btn>
          </>
        ) : (
          <>
            <Field
              label="Email hint (login)"
              value={email}
              onChangeText={setEmail}
            />
            <HelpTip id="tour.face.enroll">
              <Btn disabled={busy} onPress={() => startChallenge('enroll')}>
                <UserPlus size={16} color="#041018" />
                <BtnText>Enroll (3-step challenge · requires session)</BtnText>
              </Btn>
            </HelpTip>
            <HelpTip id="tour.face.login">
              <Btn disabled={busy} onPress={() => startChallenge('login')}>
                <ScanFace size={16} color="#041018" />
                <BtnText>Face login (3-step challenge)</BtnText>
              </Btn>
            </HelpTip>
          </>
        )}

        {msg ? <OkText>{msg}</OkText> : null}
        {err ? <ErrorText>{err}</ErrorText> : null}
      </ScrollView>
    </View>
  );
}
