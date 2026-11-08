import React, { useState, useEffect } from 'react';
import { paraphraseText, checkParaphraseHealth } from '../services/paraphraseService';
import { LoaderIcon } from './icons/LoaderIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import AiTrustFooter from './ui/AiTrustFooter';

const NETWORK_ERROR_HINT =
  "The app can't reach the API. Make sure the backend is running: run `python start_all.py` from the project root. " +
  'The gateway runs on port 8000 and the paraphrase service on port 8120. ' +
  'If you use a custom API URL, set VITE_API_BASE_URL in .env.local.';

interface TextParaphraserProps {
  /** Pre-fill with text from a library paper (e.g. "Paraphrase" on a paper). */
  initialText?: string;
}

const TextParaphraser: React.FC<TextParaphraserProps> = ({ initialText }) => {
  const [text, setText] = useState(initialText ?? '');
  const [paraphrased, setParaphrased] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isParaphrasing, setIsParaphrasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [healthNetworkError, setHealthNetworkError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkParaphraseHealth().then((h) => {
      if (cancelled) return;
      setHealthOk(h.ok);
      setHealthNetworkError(!h.ok && h.networkError);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (initialText !== undefined) {
      setText(initialText);
      setParaphrased(null);
      setGeneratedAt(null);
    }
  }, [initialText]);

  const handleParaphrase = async () => {
    setError(null);
    setParaphrased(null);
    setGeneratedAt(null);
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Please enter some text to paraphrase.');
      return;
    }
    setIsParaphrasing(true);
    try {
      const res = await paraphraseText(trimmed);
      setParaphrased(res.paraphrased);
      setGeneratedAt(new Date().toISOString());
    } catch (e: unknown) {
      let msg = 'Paraphrasing failed. Please try again.';
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
      setIsParaphrasing(false);
    }
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-8">
      <div className="flex items-center gap-3 mb-2">
        <SparklesIcon className="w-8 h-8 text-[var(--primary)]" />
        <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display">Paraphrase</h1>
      </div>
      <p className="text-[var(--text-muted)] mb-8">
        Paste any text below and get an AI paraphrase that keeps the same meaning in different words.
        You can also use &ldquo;Paraphrase&rdquo; on any paper or group document to paraphrase its text.
      </p>

      {initialText && (
        <div className="mb-6 p-3 rounded-lg bg-[var(--primary-light)] border border-[var(--primary)]/30 text-[var(--text)]">
          <p className="text-sm font-medium">Library text loaded.</p>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Click Paraphrase to rewrite it, or replace the text to paraphrase something else.
          </p>
        </div>
      )}

      {healthOk === false && (
        <div className="mb-6 p-4 rounded-lg bg-[var(--warning-light)] border border-[var(--warning)]/50 text-[var(--text)]">
          <p className="font-medium mb-1">Paraphrase service unreachable</p>
          <p className="text-sm text-[var(--text-muted)]">
            {healthNetworkError
              ? NETWORK_ERROR_HINT
              : 'The gateway or paraphrase service returned an error. Ensure all services are running (e.g. `python start_all.py`) and the paraphrase service is started on port 8120.'}
          </p>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label htmlFor="paraphrase-input" className="block text-sm font-medium text-[var(--text)] mb-2">
            Text to paraphrase
          </label>
          <textarea
            id="paraphrase-input"
            rows={10}
            placeholder="Paste your paragraph, paper excerpt, or any text here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text)] placeholder-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent resize-y min-h-[200px]"
            disabled={isParaphrasing}
          />
          {wordCount > 0 && (
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              {wordCount} word{wordCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div>
          <button
            onClick={handleParaphrase}
            disabled={isParaphrasing || !text.trim()}
            className="inline-flex items-center gap-2 min-h-[36px] bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-contrast)] font-semibold px-6 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isParaphrasing ? (
              <>
                <LoaderIcon className="w-5 h-5 animate-spin" />
                Paraphrasing…
              </>
            ) : (
              <>
                <SparklesIcon className="w-5 h-5" />
                Paraphrase
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

      {paraphrased && (
        <div className="mt-10 p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] transition-shadow hover:shadow-[var(--shadow-md)]" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <h2 className="text-lg font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
            Paraphrased text
          </h2>
          <div className="text-[var(--text)] whitespace-pre-wrap leading-relaxed">{paraphrased}</div>
          <AiTrustFooter
            feature="paraphrase"
            contextId={`paraphrase:${generatedAt ?? 'draft'}`}
            source={`Generated from ${text.trim().split(/\s+/).filter(Boolean).length} words`}
            timestamp={generatedAt}
            onRegenerate={handleParaphrase}
            metadata={{ input_chars: text.length }}
          />
        </div>
      )}
    </div>
  );
};

export default TextParaphraser;
