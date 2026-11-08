import React, { useState } from 'react';
import { PlagiarismReport } from '../types';
import { checkPlagiarism } from '../services/plagiarismService';
import { LoaderIcon } from './icons/LoaderIcon';
import { SearchIcon } from './icons/SearchIcon';

const ScoreBar: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="w-full bg-[var(--border)] rounded h-3">
      <div className={`h-3 rounded ${color}`} style={{ width: `${score}%` }} />
    </div>
  );
};

const PlagiarismChecker: React.FC = () => {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [report, setReport] = useState<PlagiarismReport | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    setError(null);
    setReport(null);
    if (!text.trim()) {
      setError('Please paste your essay text first.');
      return;
    }
    setIsChecking(true);
    try {
      const r = await checkPlagiarism(title || 'Untitled Essay', text);
      setReport(r);
    } catch (e: any) {
      setError(e?.message || 'Failed to check plagiarism.');
    } finally {
      setIsChecking(false);
    }
  };

  const inputClass = "w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]";

  return (
    <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-8">
      <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display">Plagiarism Checker</h1>
      <p className="text-[var(--text-muted)] mt-2">Check your essay against the local library to estimate originality.</p>

      <div className="mt-6 space-y-4">
        <input
          type="text"
          placeholder="Essay title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`${inputClass} py-2.5 min-h-[36px]`}
        />
        <textarea
          rows={12}
          placeholder="Paste your essay here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`${inputClass} py-3`}
        />
        <div>
          <button
            onClick={handleCheck}
            disabled={isChecking || !text.trim()}
            className="inline-flex items-center gap-2 min-h-[36px] text-white font-semibold px-6 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            style={{ background: 'var(--gradient-primary)' }}
          >
            {isChecking ? <LoaderIcon className="w-5 h-5 animate-spin" /> : <SearchIcon className="w-5 h-5" />}
            {isChecking ? 'Checking...' : 'Check'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 text-[var(--danger)]">{error}</div>
      )}

      {report && (
        <div className="mt-10 space-y-6">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 transition-shadow hover:shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)] font-display flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                  Originality Summary
                </h2>
                <p className="text-[var(--text-muted)] mt-1">Word count: {report.wordCount}</p>
              </div>
              <div className="text-right">
                <div className="text-sm text-[var(--text-muted)]">Estimated similarity</div>
                <div className="text-3xl font-extrabold text-[var(--text)]">{report.overallScore}%</div>
              </div>
            </div>
            <div className="mt-4">
              <ScoreBar score={report.overallScore} />
              <div className="mt-2 text-[var(--text-muted)] text-sm">Unique: {report.uniquePercent}%</div>
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 transition-shadow hover:shadow-[var(--shadow-sm)]">
            <h3 className="text-lg font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
              Top Sources
            </h3>
            {report.sources.length === 0 ? (
              <p className="text-[var(--text-muted)]">No significant matches.</p>
            ) : (
              <ul className="space-y-2">
                {report.sources.slice(0, 5).map(s => (
                  <li key={s.paperId} className="flex items-center justify-between bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors">
                    <div>
                      <div className="text-[var(--text)] font-medium">{s.paperTitle}</div>
                      <div className="text-[var(--text-muted)] text-sm">Matches: {s.matchCount}</div>
                    </div>
                    <div className="text-[var(--text)] font-semibold">{Math.round(s.maxSimilarity * 100)}%</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 transition-shadow hover:shadow-[var(--shadow-sm)]">
            <h3 className="text-lg font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
              Sentence Matches
            </h3>
            {report.matches.length === 0 ? (
              <p className="text-[var(--text-muted)]">No high-similarity sentences found.</p>
            ) : (
              <div className="space-y-4">
                {report.matches.slice(0, 30).map((m, idx) => (
                  <div key={`${m.sourcePaperId}-${idx}`} className="bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="text-[var(--text-muted)] text-sm">Source: <span className="text-[var(--text)]">{m.sourcePaperTitle}</span></div>
                      <div className="text-[var(--text)] font-semibold">{Math.round(m.similarity * 100)}%</div>
                    </div>
                    <div className="mt-2">
                      <div className="text-[var(--text-muted)] text-xs uppercase tracking-wide">Your text</div>
                      <div className="text-[var(--text)]">{m.overlapSentence}</div>
                    </div>
                    <div className="mt-2">
                      <div className="text-[var(--text-muted)] text-xs uppercase tracking-wide">Matched source</div>
                      <div className="text-[var(--text)]">{m.matchedSourceSentence}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlagiarismChecker;
