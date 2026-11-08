import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Note } from '../types';
import { deleteNote, getNotes, getNotesPaperSummaries, upsertNotesPaperSummary } from '../services/apiService';
import { LoaderIcon } from './icons/LoaderIcon';
import { TrashIcon } from './icons/TrashIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { XIcon } from './icons/XIcon';
import { RefreshIcon } from './icons/RefreshIcon';
import { openCitationInReader } from '../lib/readerNavigation';

interface MyNotesProps {
  onSelectPaper: (id: string) => void;
}

interface PaperSummaryState {
  text?: string;
  loading: boolean;
  error?: string;
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

const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const MyNotes: React.FC<MyNotesProps> = ({ onSelectPaper }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [summaries, setSummaries] = useState<Record<number, PaperSummaryState>>({});
  // Which paper summaries are expanded
  const [openSummaries, setOpenSummaries] = useState<Set<number>>(new Set());
  // Paper filter state
  const [paperSearch, setPaperSearch] = useState('');
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<number>>(new Set());
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchNotes = async () => {
    setIsLoading(true);
    try {
      setNotes(await getNotes());
    } finally {
      setIsLoading(false);
    }
  };

  const groupedNotes = useMemo(() => {
    const grouped = new Map<number, Note[]>();
    notes.forEach((note) => {
      const existing = grouped.get(note.paper_id) || [];
      existing.push(note);
      grouped.set(note.paper_id, existing);
    });
    return Array.from(grouped.entries())
      .map(([paperId, paperNotes]) => ({
        paperId,
        paperTitle: paperNotes[0]?.paper_title || `Paper ${paperId}`,
        notes: paperNotes.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
      }))
      .sort((a, b) => a.paperTitle.localeCompare(b.paperTitle));
  }, [notes]);

  // Papers shown in the search dropdown
  const dropdownPapers = useMemo(() => {
    if (!paperSearch.trim()) return groupedNotes;
    const q = paperSearch.toLowerCase();
    return groupedNotes.filter((g) => g.paperTitle.toLowerCase().includes(q));
  }, [groupedNotes, paperSearch]);

  // Groups shown after applying the paper filter
  const visibleGroups = useMemo(
    () => (selectedPaperIds.size === 0 ? groupedNotes : groupedNotes.filter((g) => selectedPaperIds.has(g.paperId))),
    [groupedNotes, selectedPaperIds]
  );

  const loadSummaries = async (groups: typeof groupedNotes) => {
    const cached = await getNotesPaperSummaries();

    const initial: Record<number, PaperSummaryState> = {};
    for (const row of cached) {
      initial[row.paper_id] = { text: row.summary, loading: false };
    }
    setSummaries(initial);

    const cachedIds = new Set(cached.map((r) => r.paper_id));
    const missing = groups.filter((g) => !cachedIds.has(g.paperId));

    for (const group of missing) {
      setSummaries((prev) => ({ ...prev, [group.paperId]: { loading: true } }));
      try {
        const row = await upsertNotesPaperSummary(group.paperId);
        setSummaries((prev) => ({ ...prev, [group.paperId]: { loading: false, text: row.summary } }));
      } catch (err: any) {
        setSummaries((prev) => ({
          ...prev,
          [group.paperId]: { loading: false, error: err?.message || 'Could not generate summary. Click Regenerate to retry.' },
        }));
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const fetchedNotes = await getNotes();
        setNotes(fetchedNotes);

        const grouped = new Map<number, Note[]>();
        fetchedNotes.forEach((note) => {
          const existing = grouped.get(note.paper_id) || [];
          existing.push(note);
          grouped.set(note.paper_id, existing);
        });
        const groups = Array.from(grouped.entries()).map(([paperId, paperNotes]) => ({
          paperId,
          paperTitle: paperNotes[0]?.paper_title || `Paper ${paperId}`,
          notes: paperNotes,
        }));
        if (groups.length > 0) await loadSummaries(groups);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const handleDelete = async (noteId: number) => {
    if (!window.confirm('Delete this note from your library?')) return;
    await deleteNote(noteId);
    await fetchNotes();
  };

  const handleRegenerate = async (paperId: number) => {
    setSummaries((prev) => ({ ...prev, [paperId]: { loading: true, text: prev[paperId]?.text } }));
    try {
      const row = await upsertNotesPaperSummary(paperId);
      setSummaries((prev) => ({ ...prev, [paperId]: { loading: false, text: row.summary } }));
    } catch (err: any) {
      setSummaries((prev) => ({
        ...prev,
        [paperId]: { loading: false, text: prev[paperId]?.text, error: err?.message || 'Failed to regenerate' },
      }));
    }
  };

  const toggleSummary = (paperId: number) => {
    setOpenSummaries((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
  };

  const togglePaperFilter = (paperId: number) => {
    setSelectedPaperIds((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
    setPaperSearch('');
    setSearchDropdownOpen(false);
  };

  const removePaperFilter = (paperId: number) => {
    setSelectedPaperIds((prev) => {
      const next = new Set(prev);
      next.delete(paperId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-4rem)]">
        <LoaderIcon className="w-12 h-12 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (groupedNotes.length === 0) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-8">
        <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display">My Notes</h1>
        <div className="mt-8 rounded-[28px] border border-[var(--border)] bg-[var(--surface)] px-8 py-10 text-center">
          <p className="text-lg text-[var(--text)]">No reading notes yet.</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Open any paper and use Notes Desk while you read to build your own study trail.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-8">
      <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display">My Notes</h1>
      <p className="mt-2 text-[var(--text-muted)]">Your reading notes across the library, grouped by paper.</p>

      {/* Paper filter */}
      <div className="mt-6 mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Filter by reading:</span>
          {selectedPaperIds.size === 0 && (
            <span className="text-xs text-[var(--text-muted)] italic">Showing all papers</span>
          )}
          {/* Selected paper chips */}
          {[...selectedPaperIds].map((id) => {
            const group = groupedNotes.find((g) => g.paperId === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/30 px-3 py-1 text-xs font-medium text-[var(--primary)]"
              >
                <span className="max-w-[180px] truncate">{group?.paperTitle ?? `Paper ${id}`}</span>
                <button
                  type="button"
                  onClick={() => removePaperFilter(id)}
                  className="hover:text-[var(--danger)] transition-colors"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          {selectedPaperIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPaperIds(new Set())}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors underline"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Search input + dropdown */}
        <div ref={searchRef} className="relative max-w-sm">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={paperSearch}
              onChange={(e) => {
                setPaperSearch(e.target.value);
                setSearchDropdownOpen(true);
              }}
              onFocus={() => setSearchDropdownOpen(true)}
              placeholder="Search readings to filter…"
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all"
            />
          </div>

          {searchDropdownOpen && dropdownPapers.length > 0 && (
            <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg py-1">
              {dropdownPapers.map((g) => {
                const isSelected = selectedPaperIds.has(g.paperId);
                return (
                  <button
                    key={g.paperId}
                    type="button"
                    onClick={() => togglePaperFilter(g.paperId)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                        : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center transition-colors ${isSelected ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--border)]'}`}>
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <polyline points="1.5 6 4.5 9 10.5 3" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 truncate">{g.paperTitle}</span>
                    <span className="text-xs text-[var(--text-muted)]">{g.notes.length}</span>
                  </button>
                );
              })}
              {dropdownPapers.length === 0 && (
                <p className="px-4 py-3 text-sm text-[var(--text-muted)]">No matching readings</p>
              )}
            </div>
          )}
        </div>
      </div>

      {visibleGroups.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">No notes for the selected reading(s).</p>
      )}

      <div className="divide-y divide-[var(--border)]">
        {visibleGroups.map((group) => {
          const summary = summaries[group.paperId];
          const isSummaryOpen = openSummaries.has(group.paperId);

          return (
            <section key={group.paperId} className="py-8 first:pt-0">
              {/* Paper header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <button
                    type="button"
                    onClick={() => onSelectPaper(String(group.paperId))}
                    className="text-xl font-semibold text-[var(--text)] hover:text-[var(--primary)] text-left transition-colors"
                  >
                    {group.paperTitle}
                  </button>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {group.notes.length} note{group.notes.length === 1 ? '' : 's'}
                  </p>
                </div>

                {/* Single combined control: expand pill + refresh icon */}
                <div className="flex items-center flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleSummary(group.paperId)}
                    className="inline-flex items-center gap-1.5 rounded-l-full border border-[var(--border)] pl-3 pr-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]/50 transition-colors"
                  >
                    <SparklesIcon className="w-3 h-3" />
                    AI Summary
                    <ChevronIcon open={isSummaryOpen} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRegenerate(group.paperId)}
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

              {/* AI summary — collapsed by default */}
              {summary?.loading && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--primary)]/5 px-4 py-3 text-sm text-[var(--text-muted)]">
                  <LoaderIcon className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
                  {summary.text ? 'Regenerating summary…' : 'Generating summary…'}
                </div>
              )}
              {summary?.error && !summary.loading && (
                <p className="mt-3 text-sm text-[var(--danger)]">{summary.error}</p>
              )}
              {summary?.text && !summary.loading && isSummaryOpen && (
                <div className="mt-4 rounded-xl bg-[var(--primary)]/5 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--primary)] mb-1.5 flex items-center gap-1">
                    <SparklesIcon className="w-3 h-3" /> AI Summary
                  </p>
                  <p className="text-sm leading-relaxed text-[var(--text)]">{summary.text}</p>
                </div>
              )}

              {/* Notes list */}
              <div className="mt-4 divide-y divide-[var(--border)]/60">
                {group.notes.map((note) => (
                  <div key={note.id} className="py-3.5 flex items-start gap-3 group">
                    <div className="flex-1 min-w-0">
                      {note.paragraph_index !== null && note.paragraph_index !== undefined ? (
                        <button
                          type="button"
                          onClick={() => {
                            openCitationInReader(note.paper_id, note.paragraph_index ?? 0, undefined, note.selected_text || undefined);
                            onSelectPaper(String(note.paper_id));
                          }}
                          className="text-[10px] font-semibold uppercase tracking-widest text-[var(--primary)] hover:underline"
                        >
                          ¶ {note.paragraph_index + 1}
                        </button>
                      ) : (
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Note</span>
                      )}
                      {note.selected_text && (
                        <p className="mt-1 text-xs italic text-[var(--text-muted)] line-clamp-2">"{note.selected_text}"</p>
                      )}
                      <p className="mt-1.5 text-sm leading-relaxed text-[var(--text)]">{note.content}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDelete(note.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)]"
                      title="Delete note"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
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

export default MyNotes;
