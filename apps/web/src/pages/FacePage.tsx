import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ScanFace, UserPlus } from 'lucide-react';
import { apiPost } from '../lib/api';
import { useT } from '../lib/i18n';
import { captureDataUrl } from '../lib/face-capture';
import { HelpTip, PageTourBar } from '../lib/tour';
import { ThemeToggle } from '@/components/theme-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastErr, toastOk } from '@/lib/toast';

export function FacePage({
  skipCamera = false,
}: { skipCamera?: boolean } = {}) {
  const navigate = useNavigate();
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [email, setEmail] = useState('admin@example.com');
  const token = localStorage.getItem('accessToken');

  useEffect(() => {
    if (skipCamera) return;
    let stream: MediaStream | null = null;
    void navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((err: Error) => setMsg(err.message));
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [skipCamera]);

  async function enroll() {
    if (!videoRef.current || !token) {
      setMsg('Sign in with password first, then enroll');
      return;
    }
    try {
      const imageDataUrl = await captureDataUrl(videoRef.current);
      const res = await apiPost<{ ok: boolean; limitation: string }>(
        '/auth/face/enroll',
        { imageDataUrl },
      );
      setMsg(res.limitation);
      toastOk('Enrolled');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Enroll failed';
      setMsg(message);
      toastErr(message);
    }
  }

  async function faceLogin() {
    if (!videoRef.current) return;
    try {
      const imageDataUrl = await captureDataUrl(videoRef.current);
      const res = await apiPost<{
        accessToken: string;
        limitation: string;
      }>('/auth/face/login', { imageDataUrl, email });
      localStorage.setItem('accessToken', res.accessToken);
      setMsg(res.limitation);
      toastOk(t('signIn'));
      navigate('/operator');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('err.face');
      setMsg(message);
      toastErr(message);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <HelpTip id="tour.face.title">
          <div>
            <h1 className="text-2xl font-bold">{t('faceTitle')}</h1>
            <p className="text-sm text-muted-foreground">
              Convenience match only — not certified biometrics. Fail closed to
              password.
            </p>
          </div>
        </HelpTip>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="link" asChild>
            <Link to="/">Password login</Link>
          </Button>
        </div>
      </div>
      <PageTourBar screen="face" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanFace className="size-5" /> {t('faceTitle')}
          </CardTitle>
          <CardDescription>{t('tour.face.title')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!skipCamera ? (
            <video
              ref={videoRef}
              className="aspect-video w-full rounded-md border bg-black object-cover"
              autoPlay
              playsInline
              muted
            />
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="face-email">Email hint (login)</Label>
            <Input
              id="face-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <HelpTip id="tour.face.enroll">
            <Button
              type="button"
              className="w-full"
              onClick={() => void enroll()}
            >
              <UserPlus /> Enroll (requires logged-in session)
            </Button>
          </HelpTip>
          <HelpTip id="tour.face.login">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => void faceLogin()}
            >
              <ScanFace /> Face login
            </Button>
          </HelpTip>
          {msg ? (
            <Alert>
              <AlertDescription>{msg}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
