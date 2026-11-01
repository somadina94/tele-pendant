import { FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { translate, type Locale } from '@tele-pendant/shared';
import { Link, useNavigate } from 'react-router-dom';
import { apiPost, PublicUser } from '../lib/api';
import { LanguageSelect } from '../lib/LanguageSelect';
import { readLocale } from '../lib/i18n';

export function LoginPage() {
  const navigate = useNavigate();
  const [locale, setLocale] = useState<Locale>(readLocale);
  const t = (key: string) => translate(locale, key);
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('change-me-admin-password');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await apiPost<{ accessToken: string; user: PublicUser }>(
        '/auth/login',
        { email, password },
      );
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/operator');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        Tele-Pendant
      </motion.h1>
      <p className="lede">{t('loginLede')}</p>
      <LanguageSelect onLocale={setLocale} />
      <form className="login-form" onSubmit={onSubmit}>
        <label>
          {t('email')}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>
        <label>
          {t('password')}
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={8}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? t('signingIn') : t('signIn')}
        </button>
        <Link to="/face">{t('faceLogin')}</Link>
      </form>
    </main>
  );
}
