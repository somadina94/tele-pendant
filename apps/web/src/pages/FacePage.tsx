import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiPost } from '../lib/api';
import { captureDataUrl } from '../lib/face-capture';

export function FacePage({
  skipCamera = false,
}: { skipCamera?: boolean } = {}) {
  const navigate = useNavigate();
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
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [skipCamera]);

  async function enroll() {
    if (!videoRef.current || !token) {
      setMsg('Sign in with password first, then enroll');
      return;
    }
    const imageDataUrl = await captureDataUrl(videoRef.current);
    const res = await apiPost<{ ok: boolean; limitation: string }>(
      '/auth/face/enroll',
      { imageDataUrl },
    );
    setMsg(res.limitation);
  }

  async function faceLogin() {
    if (!videoRef.current) return;
    const imageDataUrl = await captureDataUrl(videoRef.current);
    const res = await apiPost<{
      accessToken: string;
      limitation: string;
    }>('/auth/face/login', { imageDataUrl, email });
    localStorage.setItem('accessToken', res.accessToken);
    setMsg(res.limitation);
    navigate('/operator');
  }

  return (
    <main className="shell">
      <header className="op-header">
        <h1>Face auth (basic)</h1>
        <Link to="/">Password login</Link>
      </header>
      <p className="lede">
        Convenience match only — not certified biometrics. Fail closed to
        password.
      </p>
      {!skipCamera && (
        <video ref={videoRef} className="cam" autoPlay playsInline muted />
      )}

      <div className="login-form" style={{ marginTop: '1rem' }}>
        <label>
          Email hint (login)
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="button" onClick={() => void enroll()}>
          Enroll (requires logged-in session)
        </button>
        <button type="button" onClick={() => void faceLogin()}>
          Face login
        </button>
      </div>
      {msg && <p className="status-line">{msg}</p>}
    </main>
  );
}
