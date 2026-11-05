import { FormEvent, useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiPost, PublicUser } from '@/lib/api';
import { toastErr, toastOk } from '@/lib/toast';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function ConfigUsersSection() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'operator' | 'supervisor'>('operator');
  const roleId = useId();

  useEffect(() => {
    if (roleParam === 'supervisor' || roleParam === 'operator') {
      setRole(roleParam);
    }
  }, [roleParam]);

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => apiGet<PublicUser[]>('/users'),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await apiPost('/users', { email, displayName, password, role });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setEmail('');
      setDisplayName('');
      setPassword('');
      toastOk(`Added ${displayName || email}.`);
    } catch (err) {
      toastErr(err instanceof Error ? err.message : 'Could not add user');
    }
  }

  return (
    <Card id="config-users">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-5" />
          Users
        </CardTitle>
        <CardDescription>
          Create operator and supervisor accounts. Names appear on the audit log.
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.displayName ?? '—'}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.role}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : users.isSuccess ? (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        ) : null}
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => void submit(e)}>
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
