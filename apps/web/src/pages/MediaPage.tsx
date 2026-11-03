import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Mic, QrCode, ScanLine } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { useT } from '../lib/i18n';
import { HelpTip } from '../lib/tour';
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
import { toastErr, toastOk } from '@/lib/toast';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [voiceLog, setVoiceLog] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('TP-CRANE-DEMO-01');
  const [listening, setListening] = useState(false);

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

  useEffect(() => {
    if (waiting) return;
    let stream: MediaStream | null = null;
    void navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      .then((next) => {
        stream = next;
        if (videoRef.current) videoRef.current.srcObject = next;
      })
      .catch((err: unknown) => {
        setCamError(
          err instanceof Error ? err.message : 'Camera permission denied',
        );
      });
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [waiting]);

  async function resolveCode(code: string) {
    setScanResult(null);
    try {
      const row = await apiPost<{
        code: string;
        label: string;
        routeHint?: string | null;
      }>('/media/codes/resolve', { code });
      setScanResult(`${row.label} (${row.code})`);
      toastOk(row.label);
      if (row.routeHint) {
        navigate(row.routeHint);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resolve failed';
      setScanResult(message);
      toastErr(message);
    }
  }

  async function scanWithBarcodeDetector() {
    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (
            source: HTMLVideoElement,
          ) => Promise<Array<{ rawValue: string }>>;
        };
      }
    ).BarcodeDetector;
    if (!Detector || !videoRef.current) {
      setScanResult(
        'BarcodeDetector not supported — use manual code or Chrome',
      );
      return;
    }
    const detector = new Detector({
      formats: ['qr_code', 'code_128', 'ean_13'],
    });
    const codesFound = await detector.detect(videoRef.current);
    const value = codesFound[0]?.rawValue;
    if (!value) {
      setScanResult('No code in frame');
      return;
    }
    await resolveCode(value);
  }

  async function commandDirection(
    direction: 'up' | 'down',
    heard: string = direction,
  ) {
    setVoiceLog(`Heard: ${heard}`);
    try {
      const res = await apiPost<{
        ok: boolean;
        label?: string;
        reason?: string;
      }>('/media/voice', { transcript: direction });
      const line = res.ok
        ? `Heard: ${heard}. Executed: ${res.label}`
        : `Heard: ${heard}. Not executed: ${res.reason ?? 'unknown'}`;
      setVoiceLog(line);
      if (res.ok) toastOk(res.label ?? direction);
      else toastErr(res.reason ?? 'not executed');
    } catch (err) {
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
        setVoiceLog(heard ? `Heard: ${heard}` : 'Heard nothing');
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
        setVoiceLog('Heard nothing');
        recognition.stop();
        setListening(false);
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
        })
        .catch((err: Error) => {
          setVoiceLog(`Heard: ${heard}. Not executed: ${err.message}`);
        })
        .finally(() => {
          recognition.stop();
          setListening(false);
        });
    };
    recognition.onerror = (event) => {
      if (event.error === 'aborted' || sent) return;
      setVoiceLog(`Voice error: ${event.error}`);
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
    window.setTimeout(() => {
      recognition.stop();
      setListening(false);
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
            Configured RTSP: {camera.data.rtspUrl}
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
              {camError ? (
                <Alert variant="destructive">
                  <AlertDescription>{camError}</AlertDescription>
                </Alert>
              ) : (
                <video
                  ref={videoRef}
                  className="aspect-video w-full rounded-md border bg-black object-cover"
                  autoPlay
                  playsInline
                  muted
                />
              )}
              <Button
                type="button"
                onClick={() => void scanWithBarcodeDetector()}
              >
                <QrCode /> Scan QR / barcode in frame
              </Button>
            </CardContent>
          </Card>
        </HelpTip>

        <div className="space-y-4">
          <HelpTip id="tour.media.qr">
            <Card>
              <CardHeader>
                <CardTitle>Manual / known codes</CardTitle>
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
                  onClick={() => void resolveCode(manualCode)}
                >
                  Resolve
                </Button>
                {scanResult ? (
                  <p className="text-sm text-primary">{scanResult}</p>
                ) : null}
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
                  Press UP or DOWN. Each runs the hoist for about 2 seconds. You
                  can also say those words, or trolley left, trolley right, or
                  stop.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button type="button" onClick={startVoice} disabled={listening}>
                  <Mic />
                  {listening ? 'Listening…' : 'Listen (8s)'}
                </Button>
                {voiceLog ? (
                  <p className="text-sm text-primary">{voiceLog}</p>
                ) : null}
              </CardContent>
            </Card>
          </HelpTip>

          <HelpTip id="tour.media.upDown">
            <div className="flex gap-2">
              <Button type="button" onClick={() => void commandDirection('up')}>
                <ArrowUp /> UP
              </Button>
              <Button
                type="button"
                onClick={() => void commandDirection('down')}
              >
                <ArrowDown /> DOWN
              </Button>
            </div>
          </HelpTip>
        </div>
      </div>
    </div>
  );
}
