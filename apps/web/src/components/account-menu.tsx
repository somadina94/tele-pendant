import { FormEvent, useState } from 'react';
import { ChevronDown, KeyRound, User, UserPlus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiPatch } from '@/lib/api';
import { toastErr, toastOk } from '@/lib/toast';
import { getStoredUser } from '@/lib/user-session';
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
  const user = getStoredUser();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  if (!user) return null;

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
    </>
  );
}
