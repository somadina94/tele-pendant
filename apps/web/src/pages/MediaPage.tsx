import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Mic, QrCode, ScanLine } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { useT } from '../lib/i18n';
import { HelpTip } from '../lib/tour';
import { getRealtimeSocket } from '../lib/realtime';
import { PageSpinner } from '@/components/page-spinner';
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
import { isSupervisorOrAdmin } from '@/lib/user-session';
import { toastErr, toastOk } from '@/lib/toast';

/** Keep deadman pulsed through a short timed voice jog (matches API VOICE_JOG_MS). */
const VOICE_DEADMAN_HOLD_MS = 2500;
const VOICE_DEADMAN_PULSE_MS = 400;

type SpeechAlt = { transcript: string };
type SpeechResult = ArrayLike<SpeechAlt> & { isFinal?: boolean };

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export function MediaPage() {
  const navigate = useNavigate();
  const { t } = useT();
  const [scanFeedback, setScanFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const mayEditCodes = isSupervisorOrAdmin();
  const [voiceLog, setVoiceLog] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('TP-CRANE-DEMO-01');
  const canResolveManual = manualCode.trim().length > 0;
  const [listening, setListening] = useState(false);
  const deadmanPulseRef = useRef<number | null>(null);
  const deadmanHoldUntilRef = useRef(0);

  const pulseDeadman = useCallback(() => {
    // FEAT-A5: timed voice motion needs the exclusive control lease first.
    void Promise.resolve(apiPost('/safety/control/claim')).catch(
      () => undefined,
    );
    getRealtimeSocket().emit('deadman.pulse');
    void Promise.resolve(apiPost('/safety/deadman/pulse')).catch(
      () => undefined,
    );
  }, []);

  const releaseDeadman = useCallback(() => {
    getRealtimeSocket().emit('deadman.release');
    void apiPost('/safety/deadman/release').catch(() => undefined);
  }, []);

  const stopDeadmanHold = useCallback(() => {
    if (deadmanPulseRef.current != null) {
      window.clearInterval(deadmanPulseRef.current);
      deadmanPulseRef.current = null;
    }
    deadmanHoldUntilRef.current = 0;
    releaseDeadman();
  }, [releaseDeadman]);

  const startDeadmanHold = useCallback(
    (durationMs?: number) => {
      pulseDeadman();
      if (durationMs != null) {
        deadmanHoldUntilRef.current = Date.now() + durationMs;
      } else {
        deadmanHoldUntilRef.current = 0;
      }
      if (deadmanPulseRef.current != null) return;
      deadmanPulseRef.current = window.setInterval(() => {
        if (
          deadmanHoldUntilRef.current > 0 &&
          Date.now() >= deadmanHoldUntilRef.current
        ) {
          stopDeadmanHold();
          return;
        }
        pulseDeadman();
      }, VOICE_DEADMAN_PULSE_MS);
    },
    [pulseDeadman, stopDeadmanHold],
  );

  const camera = useQuery({
    queryKey: ['camera-config'],
    queryFn: () =>
      apiGet<{
        deviceCameraEnabled: boolean;
        rtspUrl: string | null;
        notes: string;
      }>('/media/camera'),
  });

  const codes = useQuery({
    queryKey: ['scan-codes'],
    queryFn: () =>
      apiGet<Array<{ code: string; label: string; routeHint?: string | null }>>(
        '/media/codes',
      ),
  });

  const waiting = camera.isLoading || codes.isLoading;
  const deviceCamera = useDeviceCamera({
    enabled: !waiting,
    facingMode: 'environment',
  });

  async function resolveCode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) {
      setScanFeedback({ ok: false, text: t('enterCode') });
      return;
    }
    setScanFeedback(null);
    try {
      const row = await apiPost<{
        code: string;
        label: string;
        routeHint?: string | null;
      }>('/media/codes/resolve', { code: trimmed });
      const text = `Resolved: ${row.label} (${row.code})`;
      setScanFeedback({ ok: true, text });
      toastOk(row.label);
      if (row.routeHint) {
        navigate(row.routeHint);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resolve failed';
      setScanFeedback({ ok: false, text: message });
      toastErr(message);
    }
  }

  async function scanFrame() {
    setScanBusy(true);
    try {
      await scanFrameInner();
    } finally {
      setScanBusy(false);
    }
  }

  async function scanFrameInner() {
    if (deviceCamera.camError) {
      return;
    }
    const video = deviceCamera.videoRef.current;
    if (!video) {
      setScanFeedback({
        ok: false,
        text: 'No camera video — allow the camera in site settings, then reload this page.',
      });
      return;
    }
    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (
            source: HTMLVideoElement,
          ) => Promise<Array<{ rawValue: string }>>;
        };
      }
    ).BarcodeDetector;
    if (Detector) {
      const detector = new Detector({
        formats: ['qr_code', 'code_128', 'ean_13'],
      });
      const codesFound = await detector.detect(video);
      const value = codesFound[0]?.rawValue;
      if (!value) {
        setScanFeedback({
          ok: false,
          text: 'No code in frame — hold a registered QR steady and try again.',
        });
        return;
      }
      await resolveCode(value);
      return;
    }
    if (video.readyState < 2) {
      setScanFeedback({
        ok: false,
        text: 'Camera still starting — wait a moment and scan again.',
      });
      return;
    }
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeOnceFromVideoElement(video);
      const value = result.getText();
      if (!value) {
        setScanFeedback({
          ok: false,
          text: 'No code in frame — hold a registered QR steady and try again.',
        });
        return;
      }
      await resolveCode(value);
    } catch {
      setScanFeedback({
        ok: false,
        text: 'No code in frame — use a QR whose text matches a registered code (see list). Safari and Firefox use ZXing; Chrome uses the built-in detector.',
      });
    }
  }

  const scanFeedbackAlert = scanFeedback ? (
    <Alert variant={scanFeedback.ok ? 'default' : 'destructive'}>
      <AlertDescription>{scanFeedback.text}</AlertDescription>
    </Alert>
  ) : null;

  async function commandDirection(
    direction: 'up' | 'down',
    heard: string = direction,
  ) {
    setVoiceLog(`Heard: ${heard}`);
    try {
      const res = await apiPost<{
        ok: boolean;
        label?: string;
        message?: string;
        reason?: string;
      }>('/media/voice', { transcript: direction });
      const line = res.ok
        ? res.message || `Heard: ${heard}. Executed: ${res.label}`
        : `Heard: ${heard}. Not executed: ${res.reason ?? 'unknown'}`;
      setVoiceLog(line);
      if (res.ok) {
        startDeadmanHold(VOICE_DEADMAN_HOLD_MS);
        toastOk(res.label ?? direction);
      } else {
        stopDeadmanHold();
        toastErr(res.reason ?? 'not executed');
      }
    } catch (err) {
      stopDeadmanHold();
      const message = err instanceof Error ? err.message : 'failed';
      setVoiceLog(`Heard: ${heard}. Not executed: ${message}`);
      toastErr(message);
    }
  }

  function directionWord(
    phrases: string[],
  ): { word: 'up' | 'down'; phrase: string } | null {
    let hit: { word: 'up' | 'down'; phrase: string } | null = null;
    for (const phrase of phrases) {
      const match = phrase.toLowerCase().match(/\b(up|down)\b/);
      const word = match?.[1];
      if (word === 'up' || word === 'down') {
        hit = { word, phrase };
      }
    }
    return hit;
  }

  function startVoice() {
    setVoiceLog(null);
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setVoiceLog('SpeechRecognition not supported in this browser');
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;
    recognition.lang = 'en-US';
    let sent = false;
    // TP-29: Listen itself is the deadman hold for timed voice motion.
    startDeadmanHold();
    recognition.onresult = (event) => {
      const phrases: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const alts = event.results[i];
        if (!alts) continue;
        for (let j = 0; j < alts.length; j++) {
          const text = alts[j]?.transcript?.trim();
          if (text) phrases.push(text);
        }
      }
      const heard = phrases[phrases.length - 1] ?? '';
      const last = event.results[event.results.length - 1];
      const hit = directionWord(phrases);
      if (sent) return;
      if (last?.isFinal === false && !hit) {
        setVoiceLog(heard ? `Heard: ${heard}` : t('nothingHeard'));
        return;
      }
      sent = true;
      if (hit) {
        void commandDirection(hit.word, hit.phrase).finally(() => {
          recognition.stop();
          setListening(false);
        });
        return;
      }
      if (!heard) {
        setVoiceLog(t('nothingHeard'));
        recognition.stop();
        setListening(false);
        stopDeadmanHold();
        return;
      }
      void apiPost<{ ok: boolean; label?: string; reason?: string }>(
        '/media/voice',
        { transcript: heard, alternatives: phrases },
      )
        .then((res) => {
          setVoiceLog(
            res.ok
              ? `Heard: ${heard}. Executed: ${res.label}`
              : `Heard: ${heard}. Not executed: ${res.reason ?? 'unknown'}`,
          );
          if (res.ok && /hoist|trolley/i.test(res.label ?? '')) {
            startDeadmanHold(VOICE_DEADMAN_HOLD_MS);
          } else {
            stopDeadmanHold();
          }
        })
        .catch((err: Error) => {
          stopDeadmanHold();
          setVoiceLog(`Heard: ${heard}. Not executed: ${err.message}`);
        })
        .finally(() => {
          recognition.stop();
          setListening(false);
        });
    };
    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      sent = true;
      stopDeadmanHold();
      setVoiceLog(
        event.error === 'no-speech'
          ? t('nothingHeard')
          : `Microphone error: ${event.error}`,
      );
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      if (!sent) {
        stopDeadmanHold();
        setVoiceLog(t('nothingHeard'));
      }
    };
    setListening(true);
    recognition.start();
    window.setTimeout(() => {
      recognition.stop();
      setListening(false);
      if (!sent) stopDeadmanHold();
    }, 8000);
  }

  if (waiting) {
    return <PageSpinner label={t('mediaTitle')} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('mediaTitle')}</h2>
        <p className="text-sm text-muted-foreground">{camera.data?.notes}</p>
        {camera.data?.rtspUrl ? (
          <p className="text-xs text-muted-foreground">
            Plant camera configured
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <HelpTip id="tour.media.camera">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScanLine className="size-4" /> Device camera
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {deviceCamera.camError ? (
                <CameraAccessAlert {...deviceCamera} />
              ) : (
                <video
                  ref={deviceCamera.videoRef}
                  className="aspect-video w-full rounded-md border bg-black object-cover"
                  autoPlay
                  playsInline
                  muted
                />
              )}
              <Button
                type="button"
                loading={scanBusy}
                onClick={() => void scanFrame()}
              >
                <QrCode />
                Scan QR / barcode in frame
              </Button>
              {scanFeedbackAlert}
            </CardContent>
          </Card>
        </HelpTip>

        <div className="space-y-4">
          <HelpTip id="tour.media.qr">
            <Card>
              <CardHeader>
                <CardTitle>Manual / known codes</CardTitle>
                <CardDescription>
                  Demo payloads: <strong>TP-CRANE-DEMO-01</strong>,{' '}
                  <strong>TP-OPS</strong>.
                  {mayEditCodes ? (
                    <>
                      {' '}
                      <Link
                        to="/admin?section=codes"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        Add or edit codes in Config
                      </Link>
                      .
                    </>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2">
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  disabled={!canResolveManual}
                  onClick={() => void resolveCode(manualCode)}
                >
                  Resolve
                </Button>
                <ul className="space-y-1 text-sm">
                  {(codes.data ?? []).map((c) => (
                    <li key={c.code}>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => void resolveCode(c.code)}
                      >
                        {c.code}
                      </Button>{' '}
                      — {c.label}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </HelpTip>

          <HelpTip id="tour.media.voice">
            <Card>
              <CardHeader>
                <CardTitle>Voice commands</CardTitle>
                <CardDescription>
                  Use Listen for allowlisted commands. Say stop anytime. Timed
                  hoist/trolley voice needs Allow timed media motion in Config
                  and a deadman hold (Listen pulses deadman while active).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button type="button" loading={listening} onClick={startVoice}>
                  <Mic />
                  {listening ? 'Listening…' : 'Listen (8s)'}
                </Button>
                {voiceLog ? (
                  <p className="text-sm text-primary">{voiceLog}</p>
                ) : null}
              </CardContent>
            </Card>
          </HelpTip>
        </div>
      </div>
    </div>
  );
}
