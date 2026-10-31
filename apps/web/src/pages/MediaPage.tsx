import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/api';

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export function MediaPage() {
  const navigate = useNavigate();
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

  function startVoice() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setVoiceLog('SpeechRecognition not supported in this browser');
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setVoiceLog(`Heard: ${transcript}`);
      void apiPost<{ ok: boolean; label?: string; reason?: string }>(
        '/media/voice',
        { transcript },
      ).then((res) => {
        setVoiceLog(
          res.ok
            ? `Executed: ${res.label}`
            : `Not executed: ${res.reason ?? 'unknown'}`,
        );
      });
    };
    recognition.onerror = (event) => setVoiceLog(`Voice error: ${event.error}`);
    setListening(true);
    recognition.start();
    window.setTimeout(() => {
      recognition.stop();
      setListening(false);
    }, 5000);
  }

  return (
    <main className="shell admin">
      <header className="op-header">
        <h1>Camera · QR · Voice</h1>
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
            Allowlisted: hoist up/down, trolley left/right, stop
          </p>
          <button type="button" onClick={startVoice} disabled={listening}>
            {listening ? 'Listening…' : 'Listen (5s)'}
          </button>
          {voiceLog && <p className="status-line">{voiceLog}</p>}
        </div>
      </section>
    </main>
  );
}
