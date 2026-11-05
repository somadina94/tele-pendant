import { ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function AccessDeniedPage({ detail }: { detail?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldX className="size-5 text-destructive" />
            Permission denied
          </CardTitle>
          <CardDescription>
            {detail ??
              'Your account role cannot open this screen. If you need access, ask a supervisor or administrator.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/operator">Back to Operator</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
