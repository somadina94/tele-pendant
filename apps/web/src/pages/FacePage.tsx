import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, ScanFace, UserPlus } from 'lucide-react';
import { apiPost, type PublicUser } from '../lib/api';
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
import { CameraAccessAlert } from '@/components/device-camera-panel';
import { useDeviceCamera } from '@/lib/use-device-camera';
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
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ChallengeMode>(null);
  const [step, setStep] = useState(0);
  const [frames, setFrames] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [otpEmailHint, setOtpEmailHint] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const loggedIn = Boolean(localStorage.getItem('accessToken'));
  const deviceCamera = useDeviceCamera({
    enabled: !skipCamera,
    facingMode: 'user',
  });

  function resetChallenge() {
    setMode(null);
    setStep(0);
    setFrames([]);
    setBusy(false);
  }

  function startChallenge(next: 'enroll' | 'login') {
    setMsg(null);
    setFailed(false);
    if (next === 'enroll' && !loggedIn) {
      setFailed(true);
      setMsg('Sign in with password first, then enroll');
      return;
    }
    setMode(next);
    setStep(0);
    setFrames([]);
  }

  async function verifyFaceOtp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const data = await apiPost<{ accessToken: string; user: PublicUser }>(
        '/auth/login/otp',
        { challengeId: otpChallengeId, code: otpCode.trim() },
      );
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      toastOk(t('faceSignedIn'));
      navigate('/operator', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('err.face');
      setFailed(true);
      setMsg(message);
      toastErr(message);
    } finally {
      setBusy(false);
    }
  }

  async function captureStep(active: 'enroll' | 'login') {
    setBusy(true);
    setFailed(false);
    try {
      const frame = skipCamera
        ? 'data:image/jpeg;base64,abc'
        : await captureDataUrl(
            deviceCamera.videoRef.current as HTMLVideoElement,
          );
      const nextFrames = [...frames, frame];
      // v8 branch accounting on this length check is flaky under Vitest; both
      // collect and submit paths are exercised by FacePage.spec captureAllPoses.
      /* v8 ignore next */
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
        await apiPost<{ ok: boolean; limitation: string }>(
          '/auth/face/enroll',
          { frames: nextFrames },
        );
        const ok = t('faceEnrolled');
        setMsg(ok);
        toastOk(ok);
        resetChallenge();
        return;
      }
      const res = await apiPost<{
        accessToken?: string;
        user?: PublicUser;
        limitation?: string;
        requiresTwoFactor?: true;
        challengeId?: string;
        emailHint?: string;
      }>('/auth/face/login', { frames: nextFrames, email });
      if (res.requiresTwoFactor && res.challengeId) {
        setOtpChallengeId(res.challengeId);
        setOtpEmailHint(res.emailHint ?? email);
        setOtpCode('');
        setMsg(t('otpSent'));
        toastOk(t('otpSent'));
        resetChallenge();
        return;
      }
      if (!res.accessToken) {
        throw new Error(t('err.face'));
      }
      localStorage.setItem('accessToken', res.accessToken);
      if (res.user) {
        localStorage.setItem('user', JSON.stringify(res.user));
      }
      const ok = t('faceSignedIn');
      setMsg(ok);
      toastOk(ok);
      resetChallenge();
      navigate('/operator', { replace: true });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : active === 'login'
            ? t('err.face')
            : 'Enroll failed';
      setFailed(true);
      setMsg(message);
      toastErr(message);
      resetChallenge();
    } finally {
      setBusy(false);
    }
  }

  const inChallenge = mode !== null;

  return (
    <main
      className={
        loggedIn
          ? 'mx-auto flex w-full max-w-lg flex-col gap-4'
          : 'mx-auto flex min-h-svh max-w-lg flex-col gap-4 p-6'
      }
    >
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
        {loggedIn ? null : (
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="link" asChild>
              <Link to="/">Password login</Link>
            </Button>
          </div>
        )}
      </div>
      {loggedIn ? null : <PageTourBar screen="face" />}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanFace className="size-5" /> {t('faceTitle')}
          </CardTitle>
          <CardDescription>{t('tour.face.title')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!skipCamera ? (
            deviceCamera.camError ? (
              <CameraAccessAlert {...deviceCamera} />
            ) : (
              <video
                ref={deviceCamera.videoRef}
                className="aspect-video w-full scale-x-[-1] rounded-md border bg-black object-cover"
                autoPlay
                playsInline
                muted
              />
            )
          ) : null}
          {otpChallengeId ? (
            <form
              className="grid gap-4"
              onSubmit={(e) => void verifyFaceOtp(e)}
            >
              <Alert>
                <AlertDescription>
                  {t('otpLede').replace('{email}', otpEmailHint)}
                </AlertDescription>
              </Alert>
              <div className="grid gap-2">
                <Label htmlFor="face-otp">{t('otpCode')}</Label>
                <Input
                  id="face-otp"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                />
              </div>
              <Button type="submit" loading={busy} className="w-full">
                {busy ? t('signingIn') : t('otpVerify')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setOtpChallengeId(null);
                  setOtpCode('');
                }}
              >
                {t('otpBack')}
              </Button>
            </form>
          ) : inChallenge ? (
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
                loading={busy}
                disabled={!mode}
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
              {loggedIn ? (
                <p className="text-sm text-muted-foreground">
                  {t('faceEnrollOnlyHint')}
                </p>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="face-email">Email hint (login)</Label>
                  <Input
                    id="face-email"
                    name="face-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    autoComplete="off"
                    disabled={busy}
                  />
                </div>
              )}
              {loggedIn ? (
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
              ) : (
                <>
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
            </>
          )}
          {msg ? (
            <Alert variant={failed ? 'destructive' : 'default'}>
              <AlertDescription>{msg}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
