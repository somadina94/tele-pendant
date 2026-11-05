import { FormEvent, useEffect, useState } from 'react';
import {
  BookOpen,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  Send,
} from 'lucide-react';
import { apiGet, apiPost, apiPut } from '../lib/api';
import { ASSISTANT_SUGGESTION_GROUPS } from '../lib/assistant-suggestions';
import { HelpTip } from '../lib/tour';
import { useT } from '../lib/i18n';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
import { Textarea } from '@/components/ui/textarea';
import { canEditAssistantSettings } from '@tele-pendant/shared';
import { getStoredUserRole } from '@/lib/user-session';
import { toastErr, toastOk } from '@/lib/toast';

/** Strip markdown asterisks so the answer reads as plain operator text. */
function toPlainAnswer(raw: string): string {
  return raw.replace(/\*/g, '').trim();
}

interface AssistantSettings {
  docsRoot: string;
  docsLink: string;
  indexed: number;
  cursorConfigured: boolean;
}

export function AssistantPage() {
  const { t } = useT();
  const mayEditDocs = canEditAssistantSettings(
    getStoredUserRole() ?? 'operator',
  );
  const [question, setQuestion] = useState('What happens on lost Modbus?');
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [docsRoot, setDocsRoot] = useState('docs');
  const [docsLink, setDocsLink] = useState('');
  const [indexed, setIndexed] = useState(0);
  const [cursorConfigured, setCursorConfigured] = useState(false);

  useEffect(() => {
    void apiGet<AssistantSettings>('/assistant/settings')
      .then((s) => {
        setDocsRoot(s.docsRoot);
        setDocsLink(s.docsLink);
        setIndexed(s.indexed);
        setCursorConfigured(s.cursorConfigured);
      })
      .catch(() => undefined);
  }, []);

  async function askQuestion(nextQuestion: string) {
    const trimmed = nextQuestion.trim();
    if (!trimmed || busy) return;
    setQuestion(trimmed);
    setBusy(true);
    try {
      const res = await apiPost<{
        answer: string;
        note: string;
        mode?: string;
      }>('/assistant/ask', { question: trimmed });
      setAnswer(toPlainAnswer(res.answer));
      toastOk('Answer ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ask failed';
      setAnswer(message);
      toastErr(message);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await askQuestion(question);
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setSettingsBusy(true);
    try {
      const s = await apiPut<AssistantSettings>('/assistant/settings', {
        docsRoot,
        docsLink,
      });
      setDocsRoot(s.docsRoot);
      setDocsLink(s.docsLink);
      setIndexed(s.indexed);
      setCursorConfigured(s.cursorConfigured);
      toastOk('Assistant settings saved');
    } catch (err) {
      toastErr(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSettingsBusy(false);
    }
  }

  async function reindex() {
    setSettingsBusy(true);
    try {
      const res = await apiPost<{ indexed: number }>('/assistant/reindex');
      setIndexed(res.indexed);
      toastOk(`Reindexed ${res.indexed} documents`);
    } catch (err) {
      toastErr(err instanceof Error ? err.message : 'Reindex failed');
    } finally {
      setSettingsBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <HelpTip id="tour.assistant.title">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5" /> Assistant
            </CardTitle>
            <CardDescription>
              {t('tour.assistant.title')}{' '}
              {cursorConfigured
                ? 'Cursor Agent is configured on the server.'
                : 'Running on local document search.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </HelpTip>

      {mayEditDocs ? (
        <Card>
          <CardContent className="pt-2">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="docs-settings" className="border-b-0">
                <AccordionTrigger>
                  <span className="flex flex-col items-start gap-0.5 text-left">
                    <span className="text-base font-semibold">
                      Docs settings
                    </span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Indexed documents: {indexed}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Admins can change the docs folder and public docs link.
                  </p>
                  <form
                    className="grid gap-3"
                    onSubmit={(e) => void saveSettings(e)}
                  >
                    <div className="grid gap-2">
                      <Label htmlFor="docs-root">Docs root path</Label>
                      <Input
                        id="docs-root"
                        value={docsRoot}
                        onChange={(e) => setDocsRoot(e.target.value)}
                        placeholder="docs"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="docs-link">Docs link (URL)</Label>
                      <Input
                        id="docs-link"
                        value={docsLink}
                        onChange={(e) => setDocsLink(e.target.value)}
                        placeholder="https://…/USER_MANUAL.md"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={settingsBusy}>
                        {settingsBusy ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Save />
                        )}
                        Save settings
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={settingsBusy}
                        onClick={() => void reindex()}
                      >
                        <RefreshCw />
                        Reindex
                      </Button>
                      {docsLink ? (
                        <Button type="button" variant="ghost" asChild>
                          <a href={docsLink} target="_blank" rel="noreferrer">
                            <ExternalLink />
                            Open docs
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </form>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Indexed documents: {indexed}. Docs settings are admin-only.
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Suggested questions</CardTitle>
          <CardDescription>
            Open a topic, then tap a question to fill the box and ask.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion
            type="multiple"
            className="w-full"
            defaultValue={['safety']}
          >
            {ASSISTANT_SUGGESTION_GROUPS.map((group) => (
              <AccordionItem key={group.id} value={group.id}>
                <AccordionTrigger>{group.title}</AccordionTrigger>
                <AccordionContent>
                  <ul className="flex flex-col gap-1.5">
                    {group.questions.map((item) => (
                      <li key={item}>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left text-sm font-normal"
                          disabled={busy}
                          onClick={() => void askQuestion(item)}
                        >
                          {item}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <HelpTip id="tour.assistant.ask">
        <Card>
          <CardContent className="pt-6">
            <form className="grid gap-4" onSubmit={(e) => void onSubmit(e)}>
              <div className="grid gap-2">
                <Label htmlFor="question">Question</Label>
                <Textarea
                  id="question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={4}
                  placeholder="Ask about deadman, Modbus, alarms, media, config…"
                />
              </div>
              <Button type="submit" disabled={busy || !question.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />}
                {busy ? 'Asking…' : 'Ask'}
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
