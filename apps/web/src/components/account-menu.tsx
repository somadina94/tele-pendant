import { FormEvent, useState } from 'react';
import {
  ChevronDown,
  KeyRound,
  Mail,
  Shield,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiPatch, apiPost } from '@/lib/api';
import { toastErr, toastOk } from '@/lib/toast';
import { getStoredUser } from '@/lib/user-session';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

function goToUsers(navigate: ReturnType<typeof useNavigate>, role?: string) {
  const params = new URLSearchParams({ section: 'users' });
  if (role) params.set('role', role);
  navigate(`/admin?${params.toString()}`);
}

export function AccountMenu() {
  const navigate = useNavigate();
  const { t } = useT();
  const user = getStoredUser();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [resetPinOpen, setResetPinOpen] = useState(false);
  const [twoFactorOpen, setTwoFactorOpen] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(
    () => getStoredUser()?.twoFactorEnabled === true,
  );
  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentResetPin, setCurrentResetPin] = useState('');
  const [newResetPin, setNewResetPin] = useState('');
  const [confirmResetPin, setConfirmResetPin] = useState('');

  if (!user) return null;

  function patchStoredUser(patch: {
    hasSafeActionPin?: boolean;
    twoFactorEnabled?: boolean;
  }) {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      localStorage.setItem('user', JSON.stringify({ ...parsed, ...patch }));
    } catch {
      // ignore
    }
  }

  async function beginEnableTwoFactor() {
    try {
      const data = await apiPost<{
        requiresTwoFactor: true;
        challengeId: string;
      }>('/auth/two-factor/enable');
      setOtpChallengeId(data.challengeId);
      setOtpCode('');
      toastOk(t('otpSent'));
    } catch (err) {
      toastErr(err instanceof Error ? err.message : t('loginFailed'));
    }
  }

  async function confirmEnableTwoFactor(event: FormEvent) {
    event.preventDefault();
    try {
      const data = await apiPost<{
        ok: boolean;
        twoFactorEnabled: boolean;
      }>('/auth/two-factor/confirm', {
        challengeId: otpChallengeId,
        code: otpCode.trim(),
      });
      setTwoFactorEnabled(data.twoFactorEnabled);
      patchStoredUser({ twoFactorEnabled: data.twoFactorEnabled });
      setOtpChallengeId(null);
      setOtpCode('');
      toastOk(t('twoFactorEnabledToast'));
      setTwoFactorOpen(false);
    } catch (err) {
      toastErr(err instanceof Error ? err.message : t('loginFailed'));
    }
  }

  async function disableTwoFactor() {
    try {
      const data = await apiPost<{
        ok: boolean;
        twoFactorEnabled: boolean;
      }>('/auth/two-factor/disable');
      setTwoFactorEnabled(false);
      patchStoredUser({ twoFactorEnabled: false });
      toastOk(t('twoFactorDisabledToast'));
      setTwoFactorOpen(false);
      void data;
    } catch (err) {
      toastErr(err instanceof Error ? err.message : t('loginFailed'));
    }
  }

  async function submitResetPin(event: FormEvent) {
    event.preventDefault();
    if (newResetPin !== confirmResetPin) {
      toastErr('New reset PINs do not match');
      return;
    }
    if (!currentResetPin.trim()) {
      toastErr(
        user?.hasSafeActionPin
          ? 'Current reset PIN is required'
          : 'Plant reset PIN is required to set your first personal PIN',
      );
      return;
    }
    try {
      await apiPatch('/auth/safe-action-pin', {
        newPin: newResetPin,
        currentPin: currentResetPin.trim(),
      });
      toastOk('Reset PIN updated.');
      patchStoredUser({ hasSafeActionPin: true });
      setCurrentResetPin('');
      setNewResetPin('');
      setConfirmResetPin('');
      setResetPinOpen(false);
    } catch (err) {
      toastErr(
        err instanceof Error ? err.message : 'Could not update reset PIN',
      );
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toastErr('New passwords do not match');
      return;
    }
    try {
      await apiPatch('/auth/password', { currentPassword, newPassword });
      toastOk('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordOpen(false);
    } catch (err) {
      toastErr(
        err instanceof Error ? err.message : 'Could not update password',
      );
    }
  }

  const label =
    user.displayName?.trim() || user.email.split('@')[0] || 'Account';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 max-w-[10rem] gap-1 px-2 md:h-9 md:max-w-none md:px-3"
            aria-label="Account menu"
          >
            <User className="size-4 shrink-0" />
            <span className="hidden truncate sm:inline">{label}</span>
            <ChevronDown className="hidden size-4 opacity-70 sm:inline" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="max-w-[14rem] truncate">
            {user.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
            <KeyRound className="size-4" />
            Change password
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setResetPinOpen(true)}>
            <Shield className="size-4" />
            {user.hasSafeActionPin ? 'Change reset PIN' : 'Set reset PIN'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setOtpChallengeId(null);
              setOtpCode('');
              setTwoFactorEnabled(getStoredUser()?.twoFactorEnabled === true);
              setTwoFactorOpen(true);
            }}
          >
            <Mail className="size-4" />
            {t('twoFactor')}
          </DropdownMenuItem>
          {user.role === 'admin' ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Accounts</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => goToUsers(navigate, 'operator')}>
                <UserPlus className="size-4" />
                Add operator
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => goToUsers(navigate, 'supervisor')}
              >
                <UserPlus className="size-4" />
                Add supervisor
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => goToUsers(navigate)}>
                <Users className="size-4" />
                Manage users
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={resetPinOpen} onOpenChange={setResetPinOpen}>
        <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {user.hasSafeActionPin ? 'Change reset PIN' : 'Set reset PIN'}
            </SheetTitle>
            <SheetDescription>
              Used only to clear e-stop after STOP (not your login password).
              First-time setup requires the plant reset PIN from install; later
              changes require your current personal PIN (at least 4 characters).
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 grid gap-4"
            onSubmit={(e) => void submitResetPin(e)}
          >
            <div className="grid gap-2">
              <Label htmlFor="account-current-reset-pin">
                {user.hasSafeActionPin
                  ? 'Current reset PIN'
                  : 'Plant reset PIN'}
              </Label>
              <Input
                id="account-current-reset-pin"
                type="password"
                autoComplete="off"
                value={currentResetPin}
                onChange={(e) => setCurrentResetPin(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-new-reset-pin">New reset PIN</Label>
              <Input
                id="account-new-reset-pin"
                type="password"
                autoComplete="off"
                value={newResetPin}
                onChange={(e) => setNewResetPin(e.target.value)}
                minLength={4}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-confirm-reset-pin">
                Confirm new reset PIN
              </Label>
              <Input
                id="account-confirm-reset-pin"
                type="password"
                autoComplete="off"
                value={confirmResetPin}
                onChange={(e) => setConfirmResetPin(e.target.value)}
                minLength={4}
                required
              />
            </div>
            <Button type="submit">Save reset PIN</Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={passwordOpen} onOpenChange={setPasswordOpen}>
        <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Change password</SheetTitle>
            <SheetDescription>
              Enter your current password, then choose a new one (at least 8
              characters).
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 grid gap-4"
            onSubmit={(e) => void submitPassword(e)}
          >
            <div className="grid gap-2">
              <Label htmlFor="account-current-password">Current password</Label>
              <Input
                id="account-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-new-password">New password</Label>
              <Input
                id="account-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-confirm-password">
                Confirm new password
              </Label>
              <Input
                id="account-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <Button type="submit">Save password</Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={twoFactorOpen} onOpenChange={setTwoFactorOpen}>
        <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t('twoFactor')}</SheetTitle>
            <SheetDescription>{t('twoFactorLede')}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 grid gap-4">
            <p className="text-sm text-muted-foreground">
              {twoFactorEnabled ? t('twoFactorOn') : t('twoFactorOff')}
            </p>
            {twoFactorEnabled ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => void disableTwoFactor()}
              >
                {t('twoFactorDisable')}
              </Button>
            ) : otpChallengeId ? (
              <form
                className="grid gap-4"
                onSubmit={(e) => void confirmEnableTwoFactor(e)}
              >
                <div className="grid gap-2">
                  <Label htmlFor="account-2fa-otp">{t('otpCode')}</Label>
                  <Input
                    id="account-2fa-otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit">{t('twoFactorConfirm')}</Button>
              </form>
            ) : (
              <Button type="button" onClick={() => void beginEnableTwoFactor()}>
                {t('twoFactorEnable')}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
