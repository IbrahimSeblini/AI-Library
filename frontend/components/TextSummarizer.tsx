import React, { useState, useEffect } from 'react';
import { summarizeText, checkSummaryHealth, SummarySize } from '../services/summaryService';
import { LoaderIcon } from './icons/LoaderIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import AiTrustFooter from './ui/AiTrustFooter';

const SIZE_OPTIONS: { value: SummarySize; label: string; description: string }[] = [
  { value: 'small', label: 'Small', description: '1–2 sentences (~30–50 words)' },
  { value: 'medium', label: 'Medium', description: 'One paragraph (~100–150 words)' },
  { value: 'large', label: 'Large', description: '2–3 paragraphs (~250–400 words)' },
];

const NETWORK_ERROR_HINT =
  "The app can't reach the API. Make sure the backend is running: run `python start_all.py` from the project root. " +
  'The gateway runs on port 8000 and the summary service on port 8110. ' +
  'If you use a custom API URL, set VITE_API_BASE_URL in .env.local.';

interface TextSummarizerProps {
  /** Pre-fill with text from a library paper or elsewhere (e.g. "Summarize" on a paper). */
  initialText?: string;
}

const TextSummarizer: React.FC<TextSummarizerProps> = ({ initialText }) => {
  const [text, setText] = useState(initialText ?? '');
  const [size, setSize] = useState<SummarySize>('medium');
  const [summary, setSummary] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [healthNetworkError, setHealthNetworkError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkSummaryHealth().then((h) => {
      if (cancelled) return;
      setHealthOk(h.ok);
      setHealthNetworkError(!h.ok && h.networkError);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (initialText !== undefined) {
      setText(initialText);
      setSummary(null);
      setGeneratedAt(null);
    }
  }, [initialText]);

  const handleSummarize = async () => {
    setError(null);
    setSummary(null);
    setGeneratedAt(null);
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Please enter some text to summarize.');
      return;
    }
    setIsSummarizing(true);
    try {
      const res = await summarizeText(trimmed, size);
      setSummary(res.summary);
      setGeneratedAt(new Date().toISOString());
    } catch (e: unknown) {
      let msg = 'Summarization failed. Please try again.';
      if (e instanceof Error && e.message) {
        if (
          e.message.includes('Network error') ||
          e.message.includes('Failed to fetch') ||
          e.message.includes('NetworkError')
        ) {
          msg = NETWORK_ERROR_HINT;
        } else {
          try {
            const d = JSON.parse(e.message) as { detail?: string };
            if (typeof d?.detail === 'string') msg = d.detail;
            else msg = e.message;
          } catch {
            msg = e.message;
          }
        }
      }
      setError(msg);
    } finally {
      setIsSummarizing(false);
    }
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-8">
      <div className="flex items-center gap-3 mb-2">
        <SparklesIcon className="w-8 h-8 text-[var(--primary)]" />
        <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display">Text Summarizer</h1>
      </div>
      <p className="text-[var(--text-muted)] mb-8">
        Paste any text below, choose a summary length, and get an AI-generated summary.
        You can also send a paper from the library via &ldquo;Summarize&rdquo; on any paper or group document.
      </p>

      {initialText && (
        <div className="mb-6 p-3 rounded-lg bg-[var(--primary-light)] border border-[var(--primary)]/30 text-[var(--text)]">
          <p className="text-sm font-medium">Library text loaded.</p>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Choose a size and click Summarize, or replace the text to summarise something else.
          </p>
        </div>
      )}

      {healthOk === false && (
        <div className="mb-6 p-4 rounded-lg bg-[var(--warning-light)] border border-[var(--warning)]/50 text-[var(--text)]">
          <p className="font-medium mb-1">Summary service unreachable</p>
          <p className="text-sm text-[var(--text-muted)]">
            {healthNetworkError
              ? NETWORK_ERROR_HINT
              : 'The gateway or summary service returned an error. Ensure all services are running (e.g. `python start_all.py`) and you have run `pip install -r summary_service/requirements.txt`.'}
          </p>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label htmlFor="summary-input" className="block text-sm font-medium text-[var(--text)] mb-2">
            Text to summarize
          </label>
          <textarea
            id="summary-input"
            rows={10}
            placeholder="Paste your article, essay, or any text here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text)] placeholder-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent resize-y min-h-[200px]"
            disabled={isSummarizing}
          />
          {wordCount > 0 && (
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              {wordCount} word{wordCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div>
          <span className="block text-sm font-medium text-[var(--text)] mb-3">Summary length</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSize(opt.value)}
                disabled={isSummarizing}
                className={`text-left rounded-lg border-2 px-4 py-3 transition-all ${
                  size === opt.value
                    ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--text-muted)]'
                } disabled:opacity-60`}
              >
                <span className="font-semibold block">{opt.label}</span>
                <span className="text-sm text-[var(--text-muted)] mt-0.5 block">{opt.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <button
            onClick={handleSummarize}
            disabled={isSummarizing || !text.trim()}
            className="inline-flex items-center gap-2 min-h-[36px] bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-contrast)] font-semibold px-6 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSummarizing ? (
              <>
                <LoaderIcon className="w-5 h-5 animate-spin" />
                Summarizing…
              </>
            ) : (
              <>
                <SparklesIcon className="w-5 h-5" />
                Summarize
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-6 p-4 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]/30 text-[var(--danger)]">
          {error}
        </div>
      )}

      {summary && (
        <div className="mt-10 p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] transition-shadow hover:shadow-[var(--shadow-md)]" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <h2 className="text-lg font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
            Summary
          </h2>
          <div className="text-[var(--text)] whitespace-pre-wrap leading-relaxed">{summary}</div>
          <AiTrustFooter
            feature="summary"
            contextId={`summary:${generatedAt ?? 'draft'}`}
            source={`Generated from ${text.trim().split(/\s+/).filter(Boolean).length} words · ${size} summary`}
            timestamp={generatedAt}
            onRegenerate={handleSummarize}
            metadata={{ size, input_chars: text.length }}
          />
        </div>
      )}
    </div>
  );
};

export default TextSummarizer;
