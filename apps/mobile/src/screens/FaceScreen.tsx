import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { apiPost } from '../api';
import { useLocale } from '../locale';
import { Field, styles } from '../ui';

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
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.section}>{t('faceTitle')}</Text>
      <Text style={styles.hint}>
        Convenience match only — not certified biometrics. Fail closed to
        password.
      </Text>
      {open && permission?.granted ? (
        <CameraView ref={camera} style={styles.camera} facing="front" />
      ) : null}
      <Field label="Email hint (login)" value={email} onChangeText={setEmail} />
      <Pressable style={styles.btn} onPress={() => void enroll()}>
        <Text style={styles.btnText}>Enroll (requires logged-in session)</Text>
      </Pressable>
      <Pressable style={styles.btn} onPress={() => void faceLogin()}>
        <Text style={styles.btnText}>Face login</Text>
      </Pressable>
      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
    </ScrollView>
  );
}
