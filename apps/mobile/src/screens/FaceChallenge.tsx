import { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, ScanFace, UserPlus } from 'lucide-react-native';
import { apiPost } from '../api';
import { useLocale } from '../locale';
import { setAccessToken } from '../token-storage';
import { HelpTip } from '../tour';
import { Btn, BtnText, Field, Hint, OkText, Section } from '../ui';

export const CHALLENGE_PROMPTS = [
  'Center your face in the frame',
  'Turn your head clearly to the left (chin past center)',
  'Turn your head clearly to the right (chin past center)',
] as const;

type ChallengeMode = 'enroll' | 'login' | null;

const PREVIEW_HEIGHT = 280;

const previewStyle = StyleSheet.create({
  frame: {
    width: Dimensions.get('window').width - 32,
    height: PREVIEW_HEIGHT,
    alignSelf: 'center',
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
});

export function FaceChallenge({
  token,
  onToken,
  active = true,
  allowEnroll = true,
  allowLogin = true,
  autoStartLogin = false,
  emailHelpTipId,
  enrollHelpTipId,
  loginHelpTipId,
}: {
  token: string;
  onToken: (token: string) => void;
  /** Keep camera mounted/active (false when screen blurred). */
  active?: boolean;
  allowEnroll?: boolean;
  allowLogin?: boolean;
  /** Jump straight into login challenge (login screen). */
  autoStartLogin?: boolean;
  emailHelpTipId?: string;
  enrollHelpTipId?: string;
  loginHelpTipId?: string;
}) {
  const { t, terror } = useLocale();
  const camera = useRef<CameraView>(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ChallengeMode>(
    autoStartLogin ? 'login' : null,
  );
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
    if (!active) setCameraReady(false);
  }, [active]);

  function resetChallenge() {
    setMode(autoStartLogin ? 'login' : null);
    setStep(0);
    setFrames([]);
    setBusy(false);
  }

  function showError(raw: string) {
    const message = terror(raw) || raw;
    setMsg(null);
    Alert.alert(t('faceAuthFailed'), message);
  }

  function startChallenge(next: 'enroll' | 'login') {
    setMsg(null);
    if (next === 'enroll' && !token) {
      showError('Sign in with password first, then enroll');
      return;
    }
    if (!permission?.granted) {
      void requestPermission().then((result) => {
        if (!result.granted) showError('Camera permission denied');
        else {
          setMode(next);
          setStep(0);
          setFrames([]);
        }
      });
      return;
    }
    if (!cameraReady) {
      showError('Wait for the camera preview, then start again.');
      return;
    }
    setMode(next);
    setStep(0);
    setFrames([]);
  }

  async function captureStep() {
    if (!mode || busy) return;
    if (!camera.current || !cameraReady) {
      showError('Camera preview is opening — wait a moment, then capture.');
      return;
    }
    setBusy(true);
    try {
      const photo = await camera.current.takePictureAsync({
        base64: true,
        quality: 0.35,
        shutterSound: false,
      });
      if (!photo?.base64) {
        showError('No camera snapshot');
        return;
      }
      const nextFrames = [...frames, `data:image/jpeg;base64,${photo.base64}`];
      if (nextFrames.length < CHALLENGE_PROMPTS.length) {
        setFrames(nextFrames);
        setStep(nextFrames.length);
        const progress = `Captured ${nextFrames.length}/${CHALLENGE_PROMPTS.length}. Pose for the next step, then tap Capture.`;
        setMsg(progress);
        return;
      }
      setFrames(nextFrames);
      setMsg('Submitting challenge…');
      if (mode === 'enroll') {
        await apiPost<{ limitation: string }>(
          '/auth/face/enroll',
          { frames: nextFrames },
          token,
        );
        const ok = t('faceEnrolled');
        setMsg(ok);
        resetChallenge();
        Alert.alert(t('faceAuthOk'), ok);
        return;
      }

      const res = await apiPost<{
        accessToken: string;
        limitation: string;
      }>('/auth/face/login', { frames: nextFrames, email });
      if (!res.accessToken) {
        showError(t('err.face'));
        resetChallenge();
        return;
      }
      await setAccessToken(res.accessToken);
      const ok = t('faceSignedIn');
      setMsg(ok);
      resetChallenge();
      Alert.alert(t('faceAuthOk'), ok, [
        {
          text: 'OK',
          onPress: () => onToken(res.accessToken),
        },
      ]);
    } catch (error) {
      const raw =
        error instanceof Error
          ? error.message
          : mode === 'login'
            ? t('err.face')
            : 'Enroll failed';
      showError(raw);
      resetChallenge();
    } finally {
      setBusy(false);
    }
  }

  const previewReady = Boolean(permission?.granted);
  const inChallenge = mode !== null;
  const showCamera = previewReady && active;

  const emailField = (
    <Field
      label="Email hint (login)"
      value={email}
      onChangeText={setEmail}
      autoComplete="off"
      textContentType="none"
      importantForAutofill="no"
      keyboardType="email-address"
    />
  );

  return (
    <>
      {msg ? <OkText>{msg}</OkText> : null}

      {!permission ? (
        <Hint>Checking camera permission…</Hint>
      ) : !permission.granted ? (
        <>
          <Hint>
            Camera permission is required for face preview and capture.
          </Hint>
          <Btn onPress={() => void requestPermission()}>
            <Camera size={16} color="#041018" />
            <BtnText>Allow camera</BtnText>
          </Btn>
        </>
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
            active={active}
            onCameraReady={() => setCameraReady(true)}
            onMountError={(event) => {
              setCameraReady(false);
              showError(event.message || 'Camera failed to start');
            }}
          />
        </View>
      ) : (
        <Hint>Open Face again to restart the camera preview.</Hint>
      )}

      {previewReady && active && !cameraReady ? (
        <Hint>Starting camera preview…</Hint>
      ) : null}

      {inChallenge ? (
        <>
          <Section>
            Step {step + 1}/{CHALLENGE_PROMPTS.length}
          </Section>
          <Hint>{CHALLENGE_PROMPTS[step]}</Hint>
          <Hint>
            Get ready in the preview, then tap Capture for this pose only.
          </Hint>
          {mode === 'login' ? emailField : null}
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
          {!autoStartLogin ? (
            <Btn disabled={busy} onPress={resetChallenge}>
              <BtnText>Cancel challenge</BtnText>
            </Btn>
          ) : null}
        </>
      ) : (
        <>
          {allowLogin ? (
            emailHelpTipId ? (
              <HelpTip id={emailHelpTipId}>{emailField}</HelpTip>
            ) : (
              emailField
            )
          ) : null}
          {allowEnroll ? (
            enrollHelpTipId ? (
              <HelpTip id={enrollHelpTipId}>
                <Btn disabled={busy} onPress={() => startChallenge('enroll')}>
                  <UserPlus size={16} color="#041018" />
                  <BtnText>
                    Enroll (3-step challenge · requires session)
                  </BtnText>
                </Btn>
              </HelpTip>
            ) : (
              <Btn disabled={busy} onPress={() => startChallenge('enroll')}>
                <UserPlus size={16} color="#041018" />
                <BtnText>Enroll (3-step challenge · requires session)</BtnText>
              </Btn>
            )
          ) : null}
          {allowLogin ? (
            loginHelpTipId ? (
              <HelpTip id={loginHelpTipId}>
                <Btn disabled={busy} onPress={() => startChallenge('login')}>
                  <ScanFace size={16} color="#041018" />
                  <BtnText>Face login (3-step challenge)</BtnText>
                </Btn>
              </HelpTip>
            ) : (
              <Btn disabled={busy} onPress={() => startChallenge('login')}>
                <ScanFace size={16} color="#041018" />
                <BtnText>Face login (3-step challenge)</BtnText>
              </Btn>
            )
          ) : null}
        </>
      )}
    </>
  );
}
