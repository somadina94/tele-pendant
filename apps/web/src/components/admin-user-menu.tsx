import { ChevronDown, UserPlus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getStoredUser } from '@/lib/user-session';

function goToUsers(navigate: ReturnType<typeof useNavigate>, role?: string) {
  const params = new URLSearchParams({ section: 'users' });
  if (role) params.set('role', role);
  navigate(`/admin?${params.toString()}`);
}

export function AdminUserMenu() {
  const navigate = useNavigate();
  const user = getStoredUser();
  if (user?.role !== 'admin') return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2 md:h-9 md:px-3"
          aria-label="Users"
        >
          <Users className="size-4 shrink-0" />
          <span className="hidden sm:inline">Users</span>
          <ChevronDown className="hidden size-4 opacity-70 sm:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Accounts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => goToUsers(navigate, 'operator')}>
          <UserPlus className="size-4" />
          Add operator
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => goToUsers(navigate, 'supervisor')}>
          <UserPlus className="size-4" />
          Add supervisor
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => goToUsers(navigate)}>
          <Users className="size-4" />
          Manage users
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
