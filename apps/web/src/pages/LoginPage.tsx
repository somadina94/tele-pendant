import { FormEvent, useEffect, useState } from 'react';
import { LogIn, ScanFace } from 'lucide-react';
import { translate, type Locale } from '@tele-pendant/shared';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiPost, PublicUser } from '../lib/api';
import { LanguageSelect } from '../lib/LanguageSelect';
import { readLocale } from '../lib/i18n';
import { clearSession } from '../lib/session';
import { HelpTip, PageTourBar } from '../lib/tour';
import { BrandMark } from '@/components/brand-mark';
import { PageSpinner } from '@/components/page-spinner';
import { ThemeToggle } from '@/components/theme-toggle';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toastOk, toastErr } from '@/lib/toast';

export function LoginPage() {
  const navigate = useNavigate();
  const [locale, setLocale] = useState<Locale>(readLocale);
  const t = (key: string) => translate(locale, key);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(() =>
    Boolean(localStorage.getItem('accessToken')),
  );

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setChecking(false);
      return;
    }
    void apiGet('/auth/me')
      .then(() => {
        if (!cancelled) navigate('/operator', { replace: true });
      })
      .catch(() => {
        clearSession();
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

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
      toastOk(t('signIn'));
      navigate('/operator');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('loginFailed');
      setError(message);
      toastErr(message);
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return <PageSpinner label="Checking session" className="min-h-svh" />;
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <BrandMark className="size-12 rounded-xl shadow-sm" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tele-Pendant</h1>
            <p className="text-muted-foreground">{t('loginLede')}</p>
          </div>
        </div>
        <ThemeToggle />
      </div>
      <PageTourBar screen="login" />
      <Card>
        <CardHeader>
          <CardTitle>{t('signIn')}</CardTitle>
          <CardDescription>{t('loginLede')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <HelpTip id="tour.login.language">
            <LanguageSelect onLocale={setLocale} />
          </HelpTip>
          <form className="grid gap-4" onSubmit={onSubmit} autoComplete="off">
            <HelpTip id="tour.login.email">
              <div className="grid gap-2">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="off"
                  required
                />
              </div>
            </HelpTip>
            <HelpTip id="tour.login.password">
              <div className="grid gap-2">
                <Label htmlFor="password">{t('password')}</Label>
                <Input
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="off"
                  required
                  minLength={8}
                />
              </div>
            </HelpTip>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <HelpTip id="tour.login.signIn">
              <Button type="submit" disabled={busy} className="w-full">
                <LogIn />
                {busy ? t('signingIn') : t('signIn')}
              </Button>
            </HelpTip>
            <HelpTip id="tour.login.face">
              <Button variant="link" asChild className="px-0">
                <Link to="/face">
                  <ScanFace />
                  {t('faceLogin')}
                </Link>
              </Button>
            </HelpTip>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
