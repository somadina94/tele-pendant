import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  Send,
} from 'lucide-react-native';
import { ASSISTANT_SUGGESTION_GROUPS } from '@tele-pendant/shared';
import { apiGet, apiPost, apiPut } from '../api';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import { useTheme } from '../theme';
import { Btn, BtnText, Card, ErrorText, Field, Hint, Section } from '../ui';

interface AssistantSettings {
  docsRoot: string;
  docsLink: string;
  indexed: number;
  cursorConfigured: boolean;
}

function toPlainAnswer(raw: string): string {
  return raw.replace(/\*/g, '').trim();
}

function AccordionSection({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const iconColor = theme === 'dark' ? '#8B9AAB' : '#5C6B7A';
  return (
    <View className="border-b border-border">
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between py-3"
      >
        <View className="mr-3 flex-1">
          <Text className="text-base font-semibold text-foreground">
            {title}
          </Text>
          {subtitle ? <Hint>{subtitle}</Hint> : null}
        </View>
        <ChevronDown
          size={16}
          color={iconColor}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {open ? <View className="pb-3">{children}</View> : null}
    </View>
  );
}

export function AssistantScreen({ token }: { token: string }) {
  const { t } = useLocale();
  const { theme } = useTheme();
  const iconColor = theme === 'dark' ? '#E8EEF4' : '#0F1419';
  const [question, setQuestion] = useState('What happens on lost Modbus?');
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [docsRoot, setDocsRoot] = useState('docs');
  const [docsLink, setDocsLink] = useState('');
  const [indexed, setIndexed] = useState(0);
  const [cursorConfigured, setCursorConfigured] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    safety: true,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiGet<AssistantSettings>('/assistant/settings', token)
      .then((s) => {
        setDocsRoot(s.docsRoot);
        setDocsLink(s.docsLink);
        setIndexed(s.indexed);
        setCursorConfigured(s.cursorConfigured);
      })
      .catch(() => undefined);
  }, [token]);

  async function askQuestion(nextQuestion: string) {
    const trimmed = nextQuestion.trim();
    if (!trimmed || busy) return;
    setQuestion(trimmed);
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{
        answer: string;
        note: string;
        mode?: string;
      }>('/assistant/ask', { question: trimmed }, token);
      setAnswer(toPlainAnswer(res.answer));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ask failed';
      setAnswer(null);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setSettingsBusy(true);
    setError(null);
    try {
      const s = await apiPut<AssistantSettings>(
        '/assistant/settings',
        { docsRoot, docsLink },
        token,
      );
      setDocsRoot(s.docsRoot);
      setDocsLink(s.docsLink);
      setIndexed(s.indexed);
      setCursorConfigured(s.cursorConfigured);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSettingsBusy(false);
    }
  }

  async function reindex() {
    setSettingsBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ indexed: number }>(
        '/assistant/reindex',
        undefined,
        token,
      );
      setIndexed(res.indexed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reindex failed');
    } finally {
      setSettingsBusy(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 p-4 pb-12"
    >
      <HelpTip id="tour.assistant.title">
        <Card>
          <View className="mb-1 flex-row items-center gap-2">
            <BookOpen size={20} color={iconColor} />
            <Section>{t('assistant')}</Section>
          </View>
          <Hint>
            {t('tour.assistant.title')}{' '}
            {cursorConfigured
              ? 'Cursor Agent is configured on the server.'
              : 'Running on local document search until CURSOR_API_KEY is set.'}
          </Hint>
        </Card>
      </HelpTip>

      <Card>
        <AccordionSection
          title="Docs settings"
          subtitle={`Indexed documents: ${indexed}`}
          open={docsOpen}
          onToggle={() => setDocsOpen((v) => !v)}
        >
          <Hint>Admins can change the docs folder and public docs link.</Hint>
          <Field
            label="Docs root path"
            value={docsRoot}
            onChangeText={setDocsRoot}
          />
          <Field
            label="Docs link (URL)"
            value={docsLink}
            onChangeText={setDocsLink}
          />
          <View className="mt-2 flex-row flex-wrap gap-2">
            <Btn
              disabled={settingsBusy}
              onPress={() => void saveSettings()}
              className="mt-0 flex-1"
            >
              {settingsBusy ? (
                <Loader2 size={16} color="#041018" />
              ) : (
                <Save size={16} color="#041018" />
              )}
              <BtnText>Save settings</BtnText>
            </Btn>
            <Btn
              disabled={settingsBusy}
              onPress={() => void reindex()}
              className="mt-0 flex-1"
            >
              <RefreshCw size={16} color="#041018" />
              <BtnText>Reindex</BtnText>
            </Btn>
          </View>
          {docsLink ? (
            <Btn
              className="mt-2"
              onPress={() => void Linking.openURL(docsLink)}
            >
              <ExternalLink size={16} color="#041018" />
              <BtnText>Open docs</BtnText>
            </Btn>
          ) : null}
        </AccordionSection>
      </Card>

      <Card>
        <Text className="mb-1 text-base font-semibold text-foreground">
          Suggested questions
        </Text>
        <Hint>Open a topic, then tap a question to ask.</Hint>
        {ASSISTANT_SUGGESTION_GROUPS.map((group) => (
          <AccordionSection
            key={group.id}
            title={group.title}
            open={Boolean(openGroups[group.id])}
            onToggle={() =>
              setOpenGroups((current) => ({
                ...current,
                [group.id]: !current[group.id],
              }))
            }
          >
            <View className="gap-1.5">
              {group.questions.map((item) => (
                <Pressable
                  key={item}
                  disabled={busy}
                  className="rounded-lg bg-muted px-3 py-2 active:opacity-80 disabled:opacity-50"
                  onPress={() => void askQuestion(item)}
                >
                  <Text className="text-sm text-foreground">{item}</Text>
                </Pressable>
              ))}
            </View>
          </AccordionSection>
        ))}
      </Card>

      <HelpTip id="tour.assistant.ask">
        <Card>
          <Field
            label="Question"
            value={question}
            onChangeText={setQuestion}
            multiline
            numberOfLines={4}
          />
          <Btn
            disabled={busy || !question.trim()}
            onPress={() => void askQuestion(question)}
          >
            {busy ? (
              <Loader2 size={16} color="#041018" />
            ) : (
              <Send size={16} color="#041018" />
            )}
            <BtnText>{busy ? 'Asking…' : 'Ask'}</BtnText>
          </Btn>
          {error ? <ErrorText>{error}</ErrorText> : null}
          {answer ? (
            <Text className="mt-3 rounded-md border border-border bg-muted p-3 text-sm text-foreground">
              {answer}
            </Text>
          ) : null}
        </Card>
      </HelpTip>
    </ScrollView>
  );
}
