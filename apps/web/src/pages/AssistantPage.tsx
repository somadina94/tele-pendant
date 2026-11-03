import { FormEvent, useState } from 'react';
import { BookOpen, Loader2, Send } from 'lucide-react';
import { apiPost } from '../lib/api';
import { HelpTip } from '../lib/tour';
import { useT } from '../lib/i18n';
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
import { toastErr, toastOk } from '@/lib/toast';

export function AssistantPage() {
  const { t } = useT();
  const [question, setQuestion] = useState('What happens on lost Modbus?');
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiPost<{ answer: string; note: string }>(
        '/assistant/ask',
        { question },
      );
      setAnswer(`${res.answer}\n\n(${res.note})`);
      toastOk('Answer ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ask failed';
      setAnswer(message);
      toastErr(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <HelpTip id="tour.assistant.title">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5" /> Local assistant
            </CardTitle>
            <CardDescription>{t('tour.assistant.title')}</CardDescription>
          </CardHeader>
        </Card>
      </HelpTip>
      <HelpTip id="tour.assistant.ask">
        <Card>
          <CardContent className="pt-6">
            <form className="grid gap-4" onSubmit={onSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="question">Question</Label>
                <Input
                  id="question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />}
                {busy ? 'Searching…' : 'Ask'}
              </Button>
            </form>
            {answer ? (
              <pre className="mt-4 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                {answer}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      </HelpTip>
    </div>
  );
}
