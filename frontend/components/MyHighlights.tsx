import React, { useState, useEffect, useMemo } from 'react';
import { HighlightGroup } from '../types';
import { getHighlightsGrouped, deleteHighlight, getHighlightColorSummaries, upsertHighlightColorSummary } from '../services/apiService';
import { LoaderIcon } from './icons/LoaderIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { XIcon } from './icons/XIcon';
import { RefreshIcon } from './icons/RefreshIcon';
import { HIGHLIGHT_COLOR_CONFIG, HIGHLIGHT_COLOR_ORDER, type HighlightColor } from '../lib/highlightColors';

interface GroupSummaryState {
  text?: string;
  loading: boolean;
  error?: string;
}

interface MyHighlightsProps {
  onSelectPaper: (id: string) => void;
}

const ChevronIcon: React.FC<{ open: boolean; className?: string }> = ({ open, className }) => (
  <svg
    className={`transition-transform duration-200 ${open ? 'rotate-180' : ''} ${className ?? 'w-3.5 h-3.5'}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const MyHighlights: React.FC<MyHighlightsProps> = ({ onSelectPaper }) => {
  const [highlightGroups, setHighlightGroups] = useState<HighlightGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [summaries, setSummaries] = useState<Partial<Record<HighlightColor, GroupSummaryState>>>({});
  // Which color groups have the summary panel expanded
  const [openSummaries, setOpenSummaries] = useState<Set<HighlightColor>>(new Set());
  // Which colors are selected in the filter (empty = All)
  const [selectedColors, setSelectedColors] = useState<Set<HighlightColor>>(new Set());

  const fetchHighlights = async () => {
    setIsLoading(true);
    try {
      setHighlightGroups(await getHighlightsGrouped());
    } catch (error) {
      console.error('Failed to fetch highlights', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSummaries = async (groups: HighlightGroup[]) => {
    const cached = await getHighlightColorSummaries();

    const initial: Partial<Record<HighlightColor, GroupSummaryState>> = {};
    for (const row of cached) {
      initial[row.color as HighlightColor] = { text: row.summary, loading: false };
    }
    setSummaries(initial);

    // Auto-generate for any group that has no cached summary
    const cachedColors = new Set(cached.map((r) => r.color));
    const missing = groups.filter((g) => !cachedColors.has(g.color));

    for (const group of missing) {
      const color = group.color as HighlightColor;
      setSummaries((prev) => ({ ...prev, [color]: { loading: true } }));
      try {
        const row = await upsertHighlightColorSummary(group.color);
        setSummaries((prev) => ({ ...prev, [color]: { loading: false, text: row.summary } }));
      } catch (err: any) {
        setSummaries((prev) => ({
          ...prev,
          [color]: { loading: false, error: err?.message || 'Could not generate summary. Click Regenerate to retry.' },
        }));
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const groups = await getHighlightsGrouped();
        setHighlightGroups(groups);
        if (groups.length > 0) await loadSummaries(groups);
      } catch (error) {
        console.error('Failed to fetch highlights', error);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const handleDelete = async (highlightId: number) => {
    try {
      await deleteHighlight(highlightId);
      await fetchHighlights();
    } catch {
      alert('Failed to delete highlight');
    }
  };

  const handleRegenerate = async (group: HighlightGroup) => {
    const color = group.color as HighlightColor;
    setSummaries((prev) => ({ ...prev, [color]: { loading: true, text: prev[color]?.text } }));
    try {
      const row = await upsertHighlightColorSummary(group.color);
      setSummaries((prev) => ({ ...prev, [color]: { loading: false, text: row.summary } }));
    } catch (err: any) {
      setSummaries((prev) => ({
        ...prev,
        [color]: { loading: false, text: prev[color]?.text, error: err?.message || 'Failed to regenerate' },
      }));
    }
  };

  const toggleSummary = (color: HighlightColor) => {
    setOpenSummaries((prev) => {
      const next = new Set(prev);
      if (next.has(color)) next.delete(color);
      else next.add(color);
      return next;
    });
  };

  const toggleColor = (color: HighlightColor) => {
    setSelectedColors((prev) => {
      const next = new Set(prev);
      if (next.has(color)) next.delete(color);
      else next.add(color);
      return next;
    });
  };

  // Colors that actually have highlights (in display order)
  const presentColors = useMemo(
    () => HIGHLIGHT_COLOR_ORDER.filter((c) => highlightGroups.some((g) => g.color === c)),
    [highlightGroups]
  );

  const sortedGroups = useMemo(
    () => [...highlightGroups].sort((a, b) => HIGHLIGHT_COLOR_ORDER.indexOf(a.color) - HIGHLIGHT_COLOR_ORDER.indexOf(b.color)),
    [highlightGroups]
  );

  const visibleGroups = useMemo(
    () => (selectedColors.size === 0 ? sortedGroups : sortedGroups.filter((g) => selectedColors.has(g.color as HighlightColor))),
    [sortedGroups, selectedColors]
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-4rem)]">
        <LoaderIcon className="w-12 h-12 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (highlightGroups.length === 0) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-8">
        <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display mb-2">My Highlights</h1>
        <p className="text-sm text-[var(--text-muted)] mt-8">No highlights yet — select text in any paper to save it here.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-8">
      <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display mb-1">My Highlights</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">Grouped by color. Click a paper title to open it.</p>

      {/* Color filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mr-1">Filter:</span>
        <button
          onClick={() => setSelectedColors(new Set())}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            selectedColors.size === 0
              ? 'text-white border-transparent'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent'
          }`}
          style={selectedColors.size === 0 ? { background: 'var(--gradient-primary)' } : {}}
        >
          All
        </button>
        {presentColors.map((color) => {
          const config = HIGHLIGHT_COLOR_CONFIG[color];
          const isActive = selectedColors.has(color);
          return (
            <button
              key={color}
              onClick={() => toggleColor(color)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                isActive
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border)]'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${config.swatch}`} />
              {config.name}
            </button>
          );
        })}
      </div>

      {visibleGroups.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">No highlights for the selected color(s).</p>
      )}

      <div className="divide-y divide-[var(--border)]">
        {visibleGroups.map((group) => {
          const color = group.color as HighlightColor;
          const config = HIGHLIGHT_COLOR_CONFIG[color];
          const summary = summaries[color];
          const isSummaryOpen = openSummaries.has(color);

          return (
            <section key={group.color} className="py-8 first:pt-0">
              {/* Color group header */}
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full ${config.swatch}`} />
                  <h2 className="text-base font-semibold text-[var(--text)]">
                    {config.name}
                    <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{group.highlights.length}</span>
                  </h2>
                </div>

                {/* Single combined control: expand pill + refresh icon */}
                <div className="flex items-center">
                  <button
                    onClick={() => toggleSummary(color)}
                    className="inline-flex items-center gap-1.5 rounded-l-full border border-[var(--border)] pl-3 pr-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]/50 transition-colors"
                  >
                    <SparklesIcon className="w-3 h-3" />
                    AI Summary
                    <ChevronIcon open={isSummaryOpen} />
                  </button>
                  <button
                    onClick={() => handleRegenerate(group)}
                    disabled={summary?.loading}
                    className="inline-flex items-center justify-center rounded-r-full border border-l-0 border-[var(--border)] px-2.5 py-1.5 text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]/50 transition-colors disabled:opacity-40"
                    title={summary?.text ? 'Regenerate summary' : 'Generate summary'}
                  >
                    {summary?.loading
                      ? <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshIcon className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
              </div>

              {/* AI summary — shown only when toggled open */}
              {summary?.loading && (
                <div className="mb-4 flex items-center gap-2 rounded-xl bg-[var(--primary)]/5 px-4 py-3 text-sm text-[var(--text-muted)]">
                  <LoaderIcon className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
                  {summary.text ? 'Regenerating summary…' : 'Generating summary…'}
                </div>
              )}
              {summary?.error && !summary.loading && (
                <p className="mb-4 text-sm text-[var(--danger)]">{summary.error}</p>
              )}
              {summary?.text && !summary.loading && isSummaryOpen && (
                <div className="mb-4 rounded-xl bg-[var(--primary)]/5 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--primary)] mb-1.5 flex items-center gap-1">
                    <SparklesIcon className="w-3 h-3" /> AI Summary
                  </p>
                  <p className="text-sm leading-relaxed text-[var(--text)]">{summary.text}</p>
                </div>
              )}

              {/* Highlights list */}
              <div className="divide-y divide-[var(--border)]/60">
                {group.highlights.map((highlight) => (
                  <div key={highlight.id} className="py-3.5 flex items-start gap-3 group">
                    <div className={`mt-1 w-0.5 self-stretch rounded-full flex-shrink-0 ${config.swatch}`} />
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => onSelectPaper(String(highlight.paper_id))}
                        className="text-xs font-medium text-[var(--primary)] hover:underline mb-1 block"
                      >
                        {highlight.paper_title || `Paper ${highlight.paper_id}`}
                      </button>
                      {highlight.context_before && (
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">{highlight.context_before}</p>
                      )}
                      <p className={`text-sm leading-relaxed font-medium ${config.text}`}>
                        {highlight.highlighted_text}
                      </p>
                      {highlight.context_after && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{highlight.context_after}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(highlight.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)]"
                      title="Delete highlight"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default MyHighlights;
