import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/api';
import { useT } from '../lib/i18n';

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

  useEffect(() => {
    let stream: MediaStream | null = null;
    async function startCam() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setCamError(
          err instanceof Error ? err.message : 'Camera permission denied',
        );
      }
    }
    void startCam();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function resolveCode(code: string) {
    setScanResult(null);
    try {
      const row = await apiPost<{
        code: string;
        label: string;
        routeHint?: string | null;
      }>('/media/codes/resolve', { code });
      setScanResult(`${row.label} (${row.code})`);
      if (row.routeHint) {
        navigate(row.routeHint);
      }
    } catch (err) {
      setScanResult(err instanceof Error ? err.message : 'Resolve failed');
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
      setVoiceLog(
        res.ok
          ? `Heard: ${heard}. Executed: ${res.label}`
          : `Heard: ${heard}. Not executed: ${res.reason ?? 'unknown'}`,
      );
    } catch (err) {
      setVoiceLog(
        `Heard: ${heard}. Not executed: ${
          err instanceof Error ? err.message : 'failed'
        }`,
      );
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

  return (
    <main className="shell admin">
      <header className="op-header">
        <h1>{t('mediaTitle')}</h1>
        <nav className="op-nav">
          <Link to="/operator">Operator</Link>
          <Link to="/ops">Ops</Link>
        </nav>
      </header>
      <p className="lede">{camera.data?.notes}</p>
      {camera.data?.rtspUrl && (
        <p className="hint">Configured RTSP: {camera.data.rtspUrl}</p>
      )}

      <section className="media-grid">
        <div className="cam-panel">
          <h2>Device camera</h2>
          {camError ? (
            <p className="error">{camError}</p>
          ) : (
            <video ref={videoRef} className="cam" autoPlay playsInline muted />
          )}
          <button type="button" onClick={() => void scanWithBarcodeDetector()}>
            Scan QR / barcode in frame
          </button>
        </div>

        <div>
          <h2>Manual / known codes</h2>
          <div className="login-form">
            <label>
              Code
              <input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
              />
            </label>
            <button type="button" onClick={() => void resolveCode(manualCode)}>
              Resolve
            </button>
          </div>
          {scanResult && <p className="status-line">{scanResult}</p>}
          <ul className="list">
            {(codes.data ?? []).map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void resolveCode(c.code)}
                >
                  {c.code}
                </button>{' '}
                — {c.label}
              </li>
            ))}
          </ul>

          <h2>Voice commands</h2>
          <p className="hint">
            Press UP or DOWN. Each runs the hoist for about 2 seconds. You can
            also say those words, or trolley left, trolley right, or stop.
          </p>
          <div className="row">
            <button type="button" onClick={() => void commandDirection('up')}>
              UP
            </button>
            <button type="button" onClick={() => void commandDirection('down')}>
              DOWN
            </button>
          </div>
          <button type="button" onClick={startVoice} disabled={listening}>
            {listening ? 'Listening…' : 'Listen (8s)'}
          </button>
          {voiceLog && <p className="status-line">{voiceLog}</p>}
        </div>
      </section>
    </main>
  );
}
