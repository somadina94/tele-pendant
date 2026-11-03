import { useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScanFace, UserPlus } from 'lucide-react-native';
import { apiPost } from '../api';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import { Btn, BtnText, Field, Hint, OkText, Section } from '../ui';

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
  const [open, setOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  async function snapshot(): Promise<string | null> {
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        setMsg('Camera permission denied');
        return null;
      }
    }
    setOpen(true);
    if (!camera.current) {
      setMsg('Camera is open. Tap again to capture.');
      return null;
    }
    const photo = await camera.current.takePictureAsync({
      base64: true,
      quality: 0.2,
    });
    if (!photo?.base64) {
      setMsg('No camera snapshot');
      return null;
    }
    return `data:image/jpeg;base64,${photo.base64}`;
  }

  async function enroll() {
    const imageDataUrl = await snapshot();
    if (!imageDataUrl) return;
    try {
      const res = await apiPost<{ limitation: string }>(
        '/auth/face/enroll',
        { imageDataUrl },
        token,
      );
      setMsg(res.limitation);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Enroll failed');
    }
  }

  async function faceLogin() {
    const imageDataUrl = await snapshot();
    if (!imageDataUrl) return;
    try {
      const res = await apiPost<{ accessToken: string; limitation: string }>(
        '/auth/face/login',
        { imageDataUrl, email },
      );
      await AsyncStorage.setItem('accessToken', res.accessToken);
      onToken(res.accessToken);
      setMsg(res.limitation);
    } catch (err) {
      setMsg(err instanceof Error ? terror(err.message) : t('err.face'));
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
            Convenience match only — not certified biometrics. Fail closed to
            password.
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
      <Field label="Email hint (login)" value={email} onChangeText={setEmail} />
      <HelpTip id="tour.face.enroll">
        <Btn onPress={() => void enroll()}>
          <UserPlus size={16} color="#041018" />
          <BtnText>Enroll (requires logged-in session)</BtnText>
        </Btn>
      </HelpTip>
      <HelpTip id="tour.face.login">
        <Btn onPress={() => void faceLogin()}>
          <ScanFace size={16} color="#041018" />
          <BtnText>Face login</BtnText>
        </Btn>
      </HelpTip>
      {msg ? <OkText>{msg}</OkText> : null}
    </ScrollView>
  );
}
