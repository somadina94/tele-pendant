import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, ScanFace, UserPlus } from 'lucide-react';
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
  'Turn your head clearly to the left (chin past center)',
  'Turn your head clearly to the right (chin past center)',
] as const;

type ChallengeMode = 'enroll' | 'login' | null;

export function FacePage({
  skipCamera = false,
}: { skipCamera?: boolean } = {}) {
  const navigate = useNavigate();
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ChallengeMode>(null);
  const [step, setStep] = useState(0);
  const [frames, setFrames] = useState<string[]>([]);
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

  function resetChallenge() {
    setMode(null);
    setStep(0);
    setFrames([]);
    setBusy(false);
  }

  function startChallenge(next: 'enroll' | 'login') {
    setMsg(null);
    if (next === 'enroll' && !token) {
      setMsg('Sign in with password first, then enroll');
      return;
    }
    setMode(next);
    setStep(0);
    setFrames([]);
  }

  async function captureStep(active: 'enroll' | 'login') {
    setBusy(true);
    try {
      const frame = skipCamera
        ? 'data:image/jpeg;base64,abc'
        : await captureDataUrl(videoRef.current as HTMLVideoElement);
      const nextFrames = [...frames, frame];
      if (nextFrames.length < CHALLENGE_PROMPTS.length) {
        setFrames(nextFrames);
        setStep(nextFrames.length);
        setMsg(
          `Captured ${nextFrames.length}/${CHALLENGE_PROMPTS.length}. Pose for the next step, then capture.`,
        );
        return;
      }
      setMsg('Submitting challenge…');
      if (active === 'enroll') {
        const res = await apiPost<{ ok: boolean; limitation: string }>(
          '/auth/face/enroll',
          { frames: nextFrames },
        );
        setMsg(res.limitation);
        toastOk('Enrolled');
      } else {
        const res = await apiPost<{
          accessToken: string;
          limitation: string;
        }>('/auth/face/login', { frames: nextFrames, email });
        localStorage.setItem('accessToken', res.accessToken);
        setMsg(res.limitation);
        toastOk(t('signIn'));
        resetChallenge();
        navigate('/operator');
        return;
      }
      resetChallenge();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : active === 'login'
            ? t('err.face')
            : 'Enroll failed';
      setMsg(message);
      toastErr(message);
      resetChallenge();
    } finally {
      setBusy(false);
    }
  }

  const inChallenge = mode !== null;

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
              className="aspect-video w-full scale-x-[-1] rounded-md border bg-black object-cover"
              autoPlay
              playsInline
              muted
            />
          ) : null}
          {inChallenge ? (
            <>
              <Alert>
                <AlertDescription>
                  Step {step + 1}/{CHALLENGE_PROMPTS.length}:{' '}
                  {CHALLENGE_PROMPTS[step]}. Hold the new pose, then capture —
                  each step must look different.
                </AlertDescription>
              </Alert>
              <Button
                type="button"
                className="w-full"
                disabled={busy || !mode}
                onClick={() => mode && void captureStep(mode)}
              >
                <Camera />{' '}
                {busy
                  ? 'Working…'
                  : `Capture pose ${step + 1}/${CHALLENGE_PROMPTS.length}`}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={resetChallenge}
              >
                Cancel challenge
              </Button>
            </>
          ) : (
            <>
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
                  onClick={() => startChallenge('enroll')}
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
                  onClick={() => startChallenge('login')}
                >
                  <ScanFace /> Face login (3-step challenge)
                </Button>
              </HelpTip>
            </>
          )}
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
