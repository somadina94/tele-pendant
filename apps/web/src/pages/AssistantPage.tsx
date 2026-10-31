import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiPost } from '../lib/api';

export function AssistantPage() {
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
    } catch (err) {
      setAnswer(err instanceof Error ? err.message : 'Ask failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="op-header">
        <h1>Local assistant</h1>
        <Link to="/operator">Operator</Link>
      </header>
      <p className="lede">
        Document search over shipped manuals — no cloud LLM, no API keys.
      </p>
      <form className="login-form" onSubmit={onSubmit}>
        <label>
          Question
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Searching…' : 'Ask'}
        </button>
      </form>
      {answer && <pre className="status-line">{answer}</pre>}
    </main>
  );
}
