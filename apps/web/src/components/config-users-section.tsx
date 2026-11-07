import { FormEvent, useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, UserX, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost, PublicUser } from '@/lib/api';
import { useConfirmDialog } from '@/lib/confirm-dialog';
import { toastErr, toastOk } from '@/lib/toast';
import { getStoredUser } from '@/lib/user-session';
import { Badge } from '@/components/ui/badge';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function isManagedUser(row: PublicUser) {
  return row.role !== 'admin';
}

export function EditUserSheet({
  user,
  open,
  onOpenChange,
  onSaved,
}: {
  user: PublicUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const roleId = useId();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'operator' | 'supervisor'>('operator');
  const [suspended, setSuspended] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? '');
    setEmail(user.email);
    setRole(user.role === 'supervisor' ? 'supervisor' : 'operator');
    setSuspended(user.suspended === true);
    setPassword('');
  }, [user]);

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const body: Record<string, unknown> = {
        displayName,
        email,
        role,
        suspended,
      };
      if (password.trim()) body.password = password.trim();
      await apiPatch(`/users/${user!.id}`, body);
      toastOk('User updated.');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toastErr(err instanceof Error ? err.message : 'Could not update user');
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit user</SheetTitle>
          <SheetDescription>
            Update profile, role, suspension, or set a new password.
          </SheetDescription>
        </SheetHeader>
        {user ? (
          <form className="mt-6 grid gap-4" onSubmit={(e) => void save(e)}>
            <div className="grid gap-2">
              <Label htmlFor="edit-user-name">Display name</Label>
              <Input
                id="edit-user-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-user-email">Email</Label>
              <Input
                id="edit-user-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={roleId}>Role</Label>
              <select
                id={roleId}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as 'operator' | 'supervisor')
                }
              >
                <option value="operator">Operator</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Suspended</p>
                <p className="text-xs text-muted-foreground">
                  Block sign-in until re-enabled.
                </p>
              </div>
              <Switch checked={suspended} onCheckedChange={setSuspended} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-user-password">
                New password (optional)
              </Label>
              <Input
                id="edit-user-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                placeholder="Leave blank to keep current"
              />
            </div>
            <Button type="submit">Save changes</Button>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function ConfigUsersSection() {
  const queryClient = useQueryClient();
  const session = getStoredUser();
  const { askConfirm, confirmDialog } = useConfirmDialog();
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'operator' | 'supervisor'>('operator');
  const roleId = useId();
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [wideLayout, setWideLayout] = useState(false);

  useEffect(() => {
    if (roleParam === 'supervisor' || roleParam === 'operator') {
      setRole(roleParam);
    }
  }, [roleParam]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setWideLayout(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => apiGet<PublicUser[]>('/users'),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await apiPost('/users', { email, displayName, password, role });
      refresh();
      setEmail('');
      setDisplayName('');
      setPassword('');
      toastOk(`Added ${displayName || email}.`);
    } catch (err) {
      toastErr(err instanceof Error ? err.message : 'Could not add user');
    }
  }

  async function toggleSuspend(row: PublicUser) {
    const next = !(row.suspended === true);
    try {
      await apiPatch(`/users/${row.id}`, { suspended: next });
      toastOk(next ? 'User suspended.' : 'User reactivated.');
      refresh();
    } catch (err) {
      toastErr(err instanceof Error ? err.message : 'Could not update user');
    }
  }

  function confirmRemove(row: PublicUser) {
    askConfirm(
      'Remove user?',
      `Permanently delete ${row.displayName ?? row.email}? This cannot be undone.`,
      'Remove',
      async () => {
        try {
          await apiDelete(`/users/${row.id}`);
          toastOk('User removed.');
          refresh();
        } catch (err) {
          toastErr(
            err instanceof Error ? err.message : 'Could not remove user',
          );
        }
      },
    );
  }

  function openEdit(row: PublicUser) {
    setEditing(row);
    setEditOpen(true);
  }

  return (
    <Card id="config-users">
      {confirmDialog}
      <EditUserSheet
        user={editing}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={refresh}
      />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-5" />
          Users
        </CardTitle>
        <CardDescription>
          Create operator and supervisor accounts. Suspend or remove accounts;
          names appear on the audit log.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {users.isError ? (
          <p className="text-sm text-destructive">
            {users.error instanceof Error
              ? users.error.message
              : 'Could not load users'}
          </p>
        ) : null}
        {users.data && users.data.length > 0 ? (
          wideLayout ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((row) => {
                  const managed = isManagedUser(row);
                  const isSelf = row.id === session?.id;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{row.displayName ?? '—'}</TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>{row.role}</TableCell>
                      <TableCell>
                        {row.suspended ? (
                          <Badge variant="destructive">Suspended</Badge>
                        ) : (
                          <Badge variant="secondary">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {managed && !isSelf ? (
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`Edit ${row.email}`}
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="size-4" />
                              <span className="sr-only">Edit</span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={
                                row.suspended
                                  ? 'Reactivate user'
                                  : 'Suspend user'
                              }
                              onClick={() => void toggleSuspend(row)}
                            >
                              <UserX className="size-4" />
                              {row.suspended ? 'Activate' : 'Suspend'}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              aria-label={`Remove ${row.email}`}
                              onClick={() => confirmRemove(row)}
                            >
                              <Trash2 className="size-4" />
                              Remove
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {isSelf ? 'You' : 'Protected'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <ul className="grid gap-3">
              {users.data.map((row) => {
                const managed = isManagedUser(row);
                const isSelf = row.id === session?.id;
                return (
                  <li
                    key={row.id}
                    className="rounded-lg border bg-card p-3 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {row.displayName ?? '—'}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {row.email}
                        </p>
                        <p className="mt-1 text-xs capitalize text-muted-foreground">
                          {row.role}
                        </p>
                      </div>
                      {row.suspended ? (
                        <Badge variant="destructive">Suspended</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {managed && !isSelf ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Edit ${row.email}`}
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="size-4" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={
                              row.suspended ? 'Reactivate user' : 'Suspend user'
                            }
                            onClick={() => void toggleSuspend(row)}
                          >
                            <UserX className="size-4" />
                            {row.suspended ? 'Activate' : 'Suspend'}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            aria-label={`Remove ${row.email}`}
                            onClick={() => confirmRemove(row)}
                          >
                            <Trash2 className="size-4" />
                            Remove
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {isSelf ? 'You' : 'Protected'}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : users.isSuccess ? (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        ) : null}
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => void submit(e)}
        >
          <div className="grid gap-2">
            <Label htmlFor="new-user-name">Display name</Label>
            <Input
              id="new-user-name"
              aria-label="new user display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-user-email">Email</Label>
            <Input
              id="new-user-email"
              type="email"
              aria-label="new user email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-user-password">Password</Label>
            <Input
              id="new-user-password"
              type="password"
              aria-label="new user password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={roleId}>Role</Label>
            <select
              id={roleId}
              aria-label="new user role"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={role}
              onChange={(event) =>
                setRole(event.target.value as 'operator' | 'supervisor')
              }
            >
              <option value="operator">Operator</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Button type="submit">
              <Plus />
              Add user
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
