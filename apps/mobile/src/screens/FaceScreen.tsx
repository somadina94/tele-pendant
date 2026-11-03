import { useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScanFace, UserPlus } from 'lucide-react-native';
import { apiPost } from '../api';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import { Btn, BtnText, Field, Hint, OkText, Section } from '../ui';

const CHALLENGE_PROMPTS = [
  'Center your face in the frame',
  'Turn your head slightly left',
  'Turn your head slightly right',
] as const;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function FaceScreen({
  token,
  onToken,
}: {
  token: string;
  onToken: (token: string) => void;
}) {
  const { t, terror } = useLocale();
  const camera = useRef<CameraView>(null);
  const [email, setEmail] = useState('admin@example.com');
  const [msg, setMsg] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  async function ensureCamera(): Promise<boolean> {
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        setMsg('Camera permission denied');
        return false;
      }
    }
    setOpen(true);
    await wait(400);
    if (!camera.current) {
      setMsg('Camera is opening. Tap again.');
      return false;
    }
    return true;
  }

  async function captureChallenge(): Promise<string[] | null> {
    if (!(await ensureCamera())) return null;
    const frames: string[] = [];
    for (let i = 0; i < CHALLENGE_PROMPTS.length; i++) {
      setPrompt(
        `Step ${i + 1}/${CHALLENGE_PROMPTS.length}: ${CHALLENGE_PROMPTS[i]}`,
      );
      await wait(i === 0 ? 700 : 1100);
      const photo = await camera.current!.takePictureAsync({
        base64: true,
        quality: 0.2,
      });
      if (!photo?.base64) {
        setMsg('No camera snapshot');
        return null;
      }
      frames.push(`data:image/jpeg;base64,${photo.base64}`);
    }
    setPrompt(null);
    return frames;
  }

  async function enroll() {
    setBusy(true);
    try {
      const frames = await captureChallenge();
      if (!frames) return;
      const res = await apiPost<{ limitation: string }>(
        '/auth/face/enroll',
        { frames },
        token,
      );
      setMsg(res.limitation);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Enroll failed');
    } finally {
      setBusy(false);
      setPrompt(null);
    }
  }

  async function faceLogin() {
    setBusy(true);
    try {
      const frames = await captureChallenge();
      if (!frames) return;
      const res = await apiPost<{ accessToken: string; limitation: string }>(
        '/auth/face/login',
        { frames, email },
      );
      await AsyncStorage.setItem('accessToken', res.accessToken);
      onToken(res.accessToken);
      setMsg(res.limitation);
    } catch (err) {
      setMsg(err instanceof Error ? terror(err.message) : t('err.face'));
    } finally {
      setBusy(false);
      setPrompt(null);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-4 pb-12"
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
      {open && permission?.granted ? (
        <CameraView
          ref={camera}
          className="mb-3 h-[220px] rounded-lg"
          facing="front"
        />
      ) : null}
      {prompt ? <Hint>{prompt}</Hint> : null}
      <Field label="Email hint (login)" value={email} onChangeText={setEmail} />
      <HelpTip id="tour.face.enroll">
        <Btn disabled={busy} onPress={() => void enroll()}>
          <UserPlus size={16} color="#041018" />
          <BtnText>Enroll (3-step challenge · requires session)</BtnText>
        </Btn>
      </HelpTip>
      <HelpTip id="tour.face.login">
        <Btn disabled={busy} onPress={() => void faceLogin()}>
          <ScanFace size={16} color="#041018" />
          <BtnText>Face login (3-step challenge)</BtnText>
        </Btn>
      </HelpTip>
      {msg ? <OkText>{msg}</OkText> : null}
    </ScrollView>
  );
}
