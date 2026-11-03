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

const CHALLENGE_PROMPTS = [
  'Center your face in the frame',
  'Turn your head slightly left',
  'Turn your head slightly right',
] as const;

function wait(ms: number) {
  /* v8 ignore next -- production delay; vitest uses MODE=test */
  const delay = import.meta.env.MODE === 'test' ? 5 : ms;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export function FacePage({
  skipCamera = false,
}: { skipCamera?: boolean } = {}) {
  const navigate = useNavigate();
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  async function captureChallenge(video: HTMLVideoElement): Promise<string[]> {
    const frames: string[] = [];
    for (let i = 0; i < CHALLENGE_PROMPTS.length; i++) {
      setPrompt(
        `Step ${i + 1}/${CHALLENGE_PROMPTS.length}: ${CHALLENGE_PROMPTS[i]}`,
      );
      await wait(i === 0 ? 700 : 1100);
      frames.push(await captureDataUrl(video));
    }
    setPrompt(null);
    return frames;
  }

  async function enroll() {
    if (!token) {
      setMsg('Sign in with password first, then enroll');
      return;
    }
    const video = videoRef.current;
    if (!video) {
      setMsg('Camera not ready');
      return;
    }
    setBusy(true);
    try {
      const frames = await captureChallenge(video);
      const res = await apiPost<{ ok: boolean; limitation: string }>(
        '/auth/face/enroll',
        { frames },
      );
      setMsg(res.limitation);
      toastOk('Enrolled');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Enroll failed';
      setMsg(message);
      toastErr(message);
    } finally {
      setBusy(false);
      setPrompt(null);
    }
  }

  async function faceLogin() {
    const video = videoRef.current;
    if (!video) return;
    setBusy(true);
    try {
      const frames = await captureChallenge(video);
      const res = await apiPost<{
        accessToken: string;
        limitation: string;
      }>('/auth/face/login', { frames, email });
      localStorage.setItem('accessToken', res.accessToken);
      setMsg(res.limitation);
      toastOk(t('signIn'));
      navigate('/operator');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('err.face');
      setMsg(message);
      toastErr(message);
    } finally {
      setBusy(false);
      setPrompt(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <HelpTip id="tour.face.title">
          <div>
            <h1 className="text-2xl font-bold">{t('faceTitle')}</h1>
            <p className="text-sm text-muted-foreground">
              Local challenge liveness (3 poses). Not ISO-certified. Fail closed
              to password. Face never authorizes e-stop or safe actions.
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
          {prompt ? (
            <Alert>
              <AlertDescription>{prompt}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="face-email">Email hint (login)</Label>
            <Input
              id="face-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <HelpTip id="tour.face.enroll">
            <Button
              type="button"
              className="w-full"
              disabled={busy}
              onClick={() => void enroll()}
            >
              <UserPlus /> Enroll (3-step challenge · requires session)
            </Button>
          </HelpTip>
          <HelpTip id="tour.face.login">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => void faceLogin()}
            >
              <ScanFace /> Face login (3-step challenge)
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
