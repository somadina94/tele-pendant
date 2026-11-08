import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Hand, Shield, Unlock } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { apiGet, apiPost, type ControlLease } from './api';
import { useT } from './i18n';
import { getRealtimeSocket } from './realtime';

function readLocalUserId(): string | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed.id?.trim() || null;
  } catch {
    return null;
  }
}

export function mergeControlLease(
  incoming: ControlLease | null | undefined,
  prev: ControlLease | null,
): ControlLease | null {
  if (!incoming) return prev;
  const me = readLocalUserId();
  return {
    ...incoming,
    youHold: Boolean(
      incoming.youHold ||
      (me && incoming.holderUserId && me === incoming.holderUserId),
    ),
  };
}

type ControlLeaseContextValue = {
  control: ControlLease | null;
  youHold: boolean;
  controlHeldByOther: boolean;
  controlLampLabel: string;
  applyControl: (next: ControlLease | null | undefined) => void;
  claim: () => Promise<void>;
  release: () => Promise<void>;
  steal: (pin: string) => Promise<void>;
  busy: boolean;
};

const ControlLeaseContext = createContext<ControlLeaseContextValue | null>(
  null,
);

export function ControlLeaseProvider({
  children,
  autoManage = import.meta.env.MODE !== 'test',
}: {
  children: ReactNode;
  /** Claim / heartbeat / release for the session (off under Vitest by default). */
  autoManage?: boolean;
}) {
  const { t } = useT();
  const [control, setControl] = useState<ControlLease | null>(null);
  const [busy, setBusy] = useState(false);
  const controlRef = useRef<ControlLease | null>(null);

  const applyControl = useCallback((next: ControlLease | null | undefined) => {
    setControl((prev) => mergeControlLease(next, prev));
  }, []);

  useEffect(() => {
    controlRef.current = control;
  }, [control]);

  useEffect(() => {
    const socket = getRealtimeSocket();
    const onSafety = (payload: { control?: ControlLease }) => {
      if (payload.control) applyControl(payload.control);
    };
    socket.on('safety.state', onSafety);
    return () => {
      socket.off('safety.state', onSafety);
    };
  }, [applyControl]);

  useEffect(() => {
    if (!autoManage) return;
    let cancelled = false;
    const apply = (next: ControlLease) => {
      if (!cancelled) applyControl(next);
    };
    const refresh = async () => {
      try {
        apply(await apiGet<ControlLease>('/safety/control'));
      } catch {
        // ignore transient errors
      }
    };
    const claim = async () => {
      try {
        apply(await apiPost<ControlLease>('/safety/control/claim'));
      } catch {
        await refresh();
      }
    };
    void claim();
    const id = window.setInterval(() => {
      if (controlRef.current?.youHold) {
        void apiPost<ControlLease>('/safety/control/heartbeat')
          .then(apply)
          .catch(() => void refresh());
      } else {
        void refresh();
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      void Promise.resolve(apiPost('/safety/control/release')).catch(
        () => undefined,
      );
    };
  }, [applyControl, autoManage]);

  const claim = useCallback(async () => {
    setBusy(true);
    try {
      applyControl(await apiPost<ControlLease>('/safety/control/claim'));
    } catch (err) {
      try {
        applyControl(await apiGet<ControlLease>('/safety/control'));
      } catch {
        // ignore
      }
      throw err;
    } finally {
      setBusy(false);
    }
  }, [applyControl]);

  const release = useCallback(async () => {
    setBusy(true);
    try {
      applyControl(await apiPost<ControlLease>('/safety/control/release'));
    } finally {
      setBusy(false);
    }
  }, [applyControl]);

  const steal = useCallback(
    async (pin: string) => {
      setBusy(true);
      try {
        applyControl(
          await apiPost<ControlLease>('/safety/control/steal', { pin }),
        );
      } finally {
        setBusy(false);
      }
    },
    [applyControl],
  );

  const youHold = Boolean(control?.youHold);
  const controlHeldByOther = Boolean(control?.held && !youHold);
  const controlLampLabel = youHold
    ? t('controlYou')
    : controlHeldByOther
      ? `${t('controlHeldBy')} ${control?.holderDisplayName || control?.holderUserId}`
      : t('controlFree');

  const value = useMemo(
    () => ({
      control,
      youHold,
      controlHeldByOther,
      controlLampLabel,
      applyControl,
      claim,
      release,
      steal,
      busy,
    }),
    [
      control,
      youHold,
      controlHeldByOther,
      controlLampLabel,
      applyControl,
      claim,
      release,
      steal,
      busy,
    ],
  );

  return (
    <ControlLeaseContext.Provider value={value}>
      {children}
    </ControlLeaseContext.Provider>
  );
}

export function useControlLease(): ControlLeaseContextValue {
  const ctx = useContext(ControlLeaseContext);
  if (!ctx) {
    throw new Error('useControlLease requires ControlLeaseProvider');
  }
  return ctx;
}

/** Main-header control pilot + claim / release / take actions. */
export function ControlLeaseHeaderControls() {
  const { t } = useT();
  const {
    youHold,
    controlHeldByOther,
    controlLampLabel,
    claim,
    release,
    steal,
    busy,
  } = useControlLease();
  const [stealOpen, setStealOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (youHold && stealOpen) {
      setStealOpen(false);
      setPin('');
    }
  }, [youHold, stealOpen]);

  const onClaim = async () => {
    setError(null);
    try {
      await claim();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('err.control'));
    }
  };

  const onRelease = async () => {
    setError(null);
    try {
      await release();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Release failed');
    }
  };

  const onSteal = async () => {
    setError(null);
    try {
      await steal(pin);
      setStealOpen(false);
      setPin('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN does not match');
    }
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <span
        role="status"
        title={controlLampLabel}
        aria-label={controlLampLabel}
        className="operator-pilot"
      >
        <span
          className={cn(
            'operator-pilot-lens',
            youHold ? 'operator-pilot-lens--go' : 'operator-pilot-lens--stop',
          )}
        />
      </span>
      <span className="sr-only">{controlLampLabel}</span>
      {youHold ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void onRelease()}
          className="h-8 gap-1.5 rounded-full border-emerald-500/45 bg-emerald-500/10 px-3 text-emerald-800 shadow-sm hover:bg-emerald-500/20 dark:text-emerald-200"
        >
          <Unlock className="size-3.5" />
          <span>{t('releaseControl')}</span>
        </Button>
      ) : controlHeldByOther ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setError(null);
            setStealOpen(true);
          }}
          className="h-8 gap-1.5 rounded-full border-amber-500/50 bg-amber-500/10 px-3 text-amber-900 shadow-sm hover:bg-amber-500/20 dark:text-amber-100"
        >
          <Hand className="size-3.5" />
          <span>{t('stealControl')}</span>
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void onClaim()}
          className="h-8 gap-1.5 rounded-full bg-sky-600 px-3 text-white shadow-sm hover:bg-sky-500"
        >
          <Shield className="size-3.5" />
          <span>{t('claimControl')}</span>
        </Button>
      )}
      {error ? (
        <span className="max-w-[10rem] truncate text-[10px] text-destructive sm:max-w-[14rem]">
          {error}
        </span>
      ) : null}

      <AlertDialog open={stealOpen} onOpenChange={setStealOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('stealControl')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('stealControlHint')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="steal-pin">PIN</Label>
            <Input
              id="steal-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              disabled={busy || !pin.trim()}
              onClick={() => void onSteal()}
            >
              {t('stealControl')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
