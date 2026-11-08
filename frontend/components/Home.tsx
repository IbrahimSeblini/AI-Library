import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Paper, Highlight, Note } from '../types';
import type { FriendsInsights, StudyPlan, StudyPlanTask } from '../types';
import { getRecommendations, searchPapers, getCategories, allAuthors, getHighlightsGrouped, getMasteryBatch, getFriendsInsights, createPaper, uploadPaperPdf, deletePaper, getActiveStudyPlan, getNotes } from '../services/apiService';
import { extractTextFromFile } from '../services/fileExtractors';
import { LoaderIcon } from './icons/LoaderIcon';
import { SearchIcon } from './icons/SearchIcon';
import { XIcon } from './icons/XIcon';
import { TrashIcon } from './icons/TrashIcon';
import { Skeleton } from './ui/Skeleton';

export type ContinueReadingItem = { id: string; title: string; authors: string[]; publicationYear: number };

interface HomeProps {
  user: User;
  continueReading: ContinueReadingItem[];
  onRemoveFromContinueReading: (id: string) => void;
  onSelectPaper: (idOrPaper: string | Paper) => void;
  onDeleteFromLibrary?: (id: string) => void;
  onNavigateToReadings?: () => void;
  onNavigateToHighlights?: () => void;
  onNavigateToNotes?: () => void;
  onNavigateToFriends?: () => void;
  onNavigateToRoadmap?: () => void;
}

// ── Colour map for highlight chips ────────────────────────────────────────────
const HIGHLIGHT_DOT: Record<string, string> = {
  yellow: 'bg-yellow-400',
  green: 'bg-green-400',
  blue: 'bg-blue-400',
  pink: 'bg-pink-400',
  orange: 'bg-orange-400',
};

// ── Section header ─────────────────────────────────────────────────────────────
const SectionHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className="flex items-center justify-between mb-5">
    <h2 className="text-base font-semibold text-[var(--text)] tracking-[-0.01em]">{title}</h2>
    {action}
  </div>
);

const ViewAll: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'View all' }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
  >
    {label} →
  </button>
);

// ── Shelf card (Continue Reading) ──────────────────────────────────────────────
const ShelfCard: React.FC<{
  item: ContinueReadingItem;
  isMastered: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onDelete?: () => void;
}> = ({ item, isMastered, onOpen, onRemove, onDelete }) => (
  <motion.div
    whileHover={{ y: -3 }}
    transition={{ duration: 0.15 }}
    className="relative w-44 flex-shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden cursor-pointer group"
    style={{ boxShadow: 'var(--shadow-sm)' }}
    onClick={onOpen}
  >
    {/* Colour accent bar */}
    <div className="h-1 w-full" style={{ background: 'var(--gradient-primary)' }} />

    <div className="p-4 flex flex-col gap-2">
      <p className="text-sm font-semibold text-[var(--text)] line-clamp-3 leading-snug group-hover:text-[var(--primary)] transition-colors">
        {item.title}
      </p>
      <p className="text-xs text-[var(--text-muted)] line-clamp-1">
        {item.authors[0] ?? 'Unknown'} · {item.publicationYear}
      </p>
      {isMastered && (
        <span className="text-[10px] font-semibold text-[var(--success)] tracking-wide uppercase">Mastered ✓</span>
      )}
    </div>

    {/* Hover actions */}
    <div className="absolute top-3 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
          title="Delete from library"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="p-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
        title="Remove from shelf"
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  </motion.div>
);

// ── Recommendation card ────────────────────────────────────────────────────────
const RecCard: React.FC<{ paper: Paper; isMastered: boolean; onSelect: () => void }> = ({ paper, isMastered, onSelect }) => (
  <motion.div
    onClick={onSelect}
    whileHover={{ y: -2 }}
    transition={{ duration: 0.15 }}
    className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 cursor-pointer group hover:border-[var(--primary)]/60 transition-colors flex flex-col gap-3"
    style={{ boxShadow: 'var(--shadow-sm)' }}
  >
    <div className="flex items-start gap-2">
      <h3 className="text-sm font-semibold text-[var(--text)] line-clamp-2 flex-1 group-hover:text-[var(--primary)] transition-colors leading-snug">
        {paper.title}
      </h3>
    </div>
    <p className="text-xs text-[var(--text-muted)] line-clamp-1">
      {paper.authors.slice(0, 2).join(', ')} · {paper.publicationYear}
    </p>
    <p className="text-xs text-[var(--text-muted)] line-clamp-2 flex-1">{paper.summary}</p>
    <div className="flex items-center justify-between gap-2 mt-auto">
      <span
        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
        style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
      >
        {isMastered ? '✓ ' : ''}{paper.subject}
      </span>
      <span className="text-xs text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity font-medium">
        Read →
      </span>
    </div>
  </motion.div>
);

// ── Home ───────────────────────────────────────────────────────────────────────
const Home: React.FC<HomeProps> = ({
  user, continueReading, onRemoveFromContinueReading, onSelectPaper,
  onDeleteFromLibrary, onNavigateToReadings, onNavigateToHighlights, onNavigateToNotes, onNavigateToFriends, onNavigateToRoadmap,
}) => {
  const [recommendations, setRecommendations] = useState<Paper[]>([]);
  const [searchResults, setSearchResults] = useState<Paper[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [authors] = useState<string[]>(allAuthors);
  const [recentHighlights, setRecentHighlights] = useState<Highlight[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [friendsInsights, setFriendsInsights] = useState<FriendsInsights | null>(null);
  const [activePlan, setActivePlan] = useState<StudyPlan | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ subject: '', author: '', startYear: '', endYear: '' });
  const [showFilters, setShowFilters] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [masteryMap, setMasteryMap] = useState<Record<string, boolean>>({});
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'extracting' | 'saving'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const paperIdsForMastery = useMemo(() => {
    const rec = recommendations.map((p) => p.id);
    const search = searchResults?.map((p) => p.id) ?? [];
    const cont = continueReading.map((c) => c.id);
    return [...new Set([...rec, ...search, ...cont])];
  }, [recommendations, searchResults, continueReading]);

  const paperIdsKey = useMemo(() => [...paperIdsForMastery].sort().join(','), [paperIdsForMastery]);

  useEffect(() => {
    if (paperIdsForMastery.length === 0) return;
    getMasteryBatch(paperIdsForMastery)
      .then((batch) => {
        const next: Record<string, boolean> = {};
        paperIdsForMastery.forEach((id) => { next[id] = batch[id]?.is_mastered ?? false; });
        setMasteryMap(next);
      })
      .catch(() => {});
  }, [paperIdsKey]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const cats = await getCategories();
        setCategories(cats);
        if (!searchQuery && !Object.values(filters).some(f => f)) {
          const recs = await getRecommendations();
          setRecommendations(recs);
        }
      } catch (error) {
        console.error('Failed to fetch initial data', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    getHighlightsGrouped()
      .then((groups) => {
        const all = groups.flatMap(g => g.highlights);
        const sorted = all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecentHighlights(sorted.slice(0, 5));
      })
      .catch(() => setRecentHighlights([]));
    getNotes()
      .then((notes) => {
        const sorted = [...notes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecentNotes(sorted.slice(0, 5));
      })
      .catch(() => setRecentNotes([]));
  }, []);

  useEffect(() => {
    getFriendsInsights(user.id).then(setFriendsInsights).catch(() => setFriendsInsights(null));
  }, [user.id]);

  useEffect(() => {
    getActiveStudyPlan().then(setActivePlan).catch(() => setActivePlan(null));
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() && !Object.values(filters).some(f => f)) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    setSearchResults([]);
    try {
      const filterParams = {
        subject: filters.subject || undefined,
        author: filters.author || undefined,
        startYear: filters.startYear ? parseInt(filters.startYear) : undefined,
        endYear: filters.endYear ? parseInt(filters.endYear) : undefined,
      };
      const results = await searchPapers(searchQuery, filterParams);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed', error);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, filters]);

  const handleFormSubmit = (e: React.FormEvent) => { e.preventDefault(); handleSearch(); };

  const clearSearch = () => {
    setSearchQuery('');
    setFilters({ subject: '', author: '', startYear: '', endYear: '' });
    setSearchResults(null);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleUploadDocument = useCallback(async (file: File) => {
    setUploadError(null);
    setUploadStatus('extracting');
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setUploadStatus('saving');
        const paper = await uploadPaperPdf(file);
        onSelectPaper(paper);
        setRecommendations(prev => [paper, ...prev.filter(p => p.id !== paper.id)]);
      } else {
        const { text, label } = await extractTextFromFile(file);
        if (!text?.trim()) { setUploadError('No text could be extracted.'); setUploadStatus('idle'); return; }
        const title = label.replace(/\.[^.]+$/, '') || 'Untitled document';
        const summary = text.trim().length > 400 ? text.trim().slice(0, 400) + '…' : text.trim();
        setUploadStatus('saving');
        const paper = await createPaper({ title, authors: [], publicationYear: new Date().getFullYear(), subject: 'Uploaded', summary: summary || title, fullText: text.trim() });
        onSelectPaper(paper);
        setRecommendations(prev => [paper, ...prev.filter(p => p.id !== paper.id)]);
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadStatus('idle');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [onSelectPaper]);

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = ['application/pdf', 'text/plain', 'text/markdown'].includes(file.type) || /\.(pdf|txt|md|epub)$/i.test(file.name);
    if (!ok) { setUploadError('Please choose a PDF, TXT, or EPUB file.'); return; }
    handleUploadDocument(file);
  };

  // Today's tasks helper
  const getLocalToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const todayStr = getLocalToday();
  const currentDay = activePlan?.days?.find((d) => d.date === todayStr)
    ?? (activePlan?.days?.length
      ? [...(activePlan.days ?? [])].sort((a, b) => a.sequence - b.sequence).find((d) => d.date > todayStr)
        ?? activePlan?.days?.[activePlan.days.length - 1]
      : null);
  const todayTasks = (currentDay?.tasks ?? []).slice(0, 3);

  const firstName = user.name.split(' ')[0];
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const hasActiveFilters = Object.values(filters).some(f => f);

  // Shared filter classes
  const filterSelect = 'border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50 focus:border-[var(--primary)] transition-all flex-1 min-w-[120px]';
  const filterInput = 'border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50 focus:border-[var(--primary)] transition-all w-28';

  return (
    <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-10">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.epub,application/pdf,text/plain,text/markdown,application/epub+zip"
        onChange={onFileInputChange}
        className="hidden"
      />

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mb-8">
        <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-widest mb-1">{dateLabel}</p>
        <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display">
          Welcome back,{' '}
          <span style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            {firstName}
          </span>
        </h1>
      </motion.div>

      {/* ── Search ────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.35 }} className="mb-10">
        <form onSubmit={handleFormSubmit}>
          <div className="flex items-center gap-2">
            {/* Search input */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <SearchIcon className="h-4 w-4 text-[var(--text-muted)]" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search papers, authors, topics…"
                className="w-full h-11 pl-10 pr-10 text-sm bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-muted)] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50 focus:border-[var(--primary)] transition-all"
              />
              {(searchQuery || hasActiveFilters) && (
                <button type="button" onClick={clearSearch} className="absolute inset-y-0 right-3 flex items-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                  <XIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filters toggle */}
            <button
              type="button"
              onClick={() => setShowFilters(v => !v)}
              className={`h-11 px-4 rounded-2xl border text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                showFilters || hasActiveFilters
                  ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary-light)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)] hover:text-[var(--text)]'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 8h10M11 12h2M11 16h2" />
              </svg>
              Filters{hasActiveFilters ? ` (${Object.values(filters).filter(Boolean).length})` : ''}
            </button>

            {/* Search button */}
            <button
              type="submit"
              className="h-11 px-5 rounded-2xl text-sm font-semibold text-white transition-all hover:opacity-90 whitespace-nowrap"
              style={{ background: 'var(--gradient-primary)' }}
            >
              Search
            </button>
          </div>

          {/* Collapsible filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--border)]">
                  <select name="subject" value={filters.subject} onChange={handleFilterChange} className={filterSelect} style={{ background: 'var(--surface)' }}>
                    <option value="">Subject</option>
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <select name="author" value={filters.author} onChange={handleFilterChange} className={filterSelect} style={{ background: 'var(--surface)' }}>
                    <option value="">Author</option>
                    {authors.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <input type="number" name="startYear" value={filters.startYear} onChange={handleFilterChange} placeholder="From year" className={filterInput} style={{ background: 'var(--surface)' }} />
                  <input type="number" name="endYear" value={filters.endYear} onChange={handleFilterChange} placeholder="To year" className={filterInput} style={{ background: 'var(--surface)' }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
        {uploadError && <p className="mt-2 text-xs text-[var(--danger)]">{uploadError}</p>}
      </motion.div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {isSearching ? (
        <div className="flex justify-center items-center h-40">
          <LoaderIcon className="w-8 h-8 animate-spin text-[var(--primary)]" />
        </div>
      ) : searchResults ? (
        <div>
          <SectionHeader title={`Results — ${searchResults.length} paper${searchResults.length !== 1 ? 's' : ''}`} action={<button type="button" onClick={clearSearch} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Clear</button>} />
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((paper, i) => (
                <motion.div key={paper.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <RecCard paper={paper} isMastered={masteryMap[paper.id] ?? false} onSelect={() => onSelectPaper(paper)} />
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)] text-center py-12">No papers matched your query.</p>
          )}
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
              <Skeleton height={18} />
              <Skeleton height={13} width="55%" />
              <Skeleton height={13} />
              <Skeleton height={13} width="75%" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-12">

          {/* 1. Continue Reading */}
          <section>
            <SectionHeader
              title="Continue Reading"
              action={onNavigateToReadings ? <ViewAll onClick={onNavigateToReadings} label="Readings" /> : undefined}
            />
            {continueReading.length === 0 ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center">
                <p className="text-sm font-medium text-[var(--text)]">Nothing here yet</p>
                <p className="mt-1 text-xs text-[var(--text-muted)] max-w-xs mx-auto">Upload a document or open a paper from search to start reading.</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadStatus !== 'idle'}
                  className="mt-4 h-9 px-4 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--gradient-primary)' }}
                >
                  {uploadStatus === 'idle' ? 'Upload document' : uploadStatus === 'extracting' ? 'Extracting…' : 'Adding…'}
                </button>
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {continueReading.slice(0, 8).map((item) => (
                  <ShelfCard
                    key={item.id}
                    item={item}
                    isMastered={masteryMap[item.id] ?? false}
                    onOpen={() => onSelectPaper(item.id)}
                    onRemove={() => onRemoveFromContinueReading(item.id)}
                    onDelete={onDeleteFromLibrary ? async () => {
                      if (!window.confirm('Delete this document from your library?')) return;
                      try { await deletePaper(item.id); onDeleteFromLibrary(item.id); }
                      catch (err) { alert(err instanceof Error ? err.message : 'Failed to delete.'); }
                    } : undefined}
                  />
                ))}
              </div>
            )}
          </section>

          {/* 2. Recent Highlights + Recent Notes — always two columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Recent Highlights */}
            <section>
              <SectionHeader
                title="Recent Highlights"
                action={onNavigateToHighlights ? <ViewAll onClick={onNavigateToHighlights} /> : undefined}
              />
              {recentHighlights.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
                  <p className="text-sm text-[var(--text-muted)]">No highlights yet — open a paper and start highlighting.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentHighlights.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={onNavigateToHighlights}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)]/40 transition-colors text-left group"
                    >
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${HIGHLIGHT_DOT[h.color] ?? 'bg-[var(--primary)]'}`} />
                      <p className="text-sm text-[var(--text)] line-clamp-1 flex-1 min-w-0">{h.highlighted_text}</p>
                      {h.paper_title && (
                        <span className="text-xs text-[var(--text-muted)] flex-shrink-0 hidden sm:block group-hover:text-[var(--primary)] transition-colors">
                          {h.paper_title.length > 26 ? h.paper_title.slice(0, 26) + '…' : h.paper_title}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Recent Notes */}
            <section>
              <SectionHeader
                title="Recent Notes"
                action={onNavigateToNotes ? <ViewAll onClick={onNavigateToNotes} label="View all" /> : undefined}
              />
              {recentNotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
                  <p className="text-sm text-[var(--text-muted)]">No notes yet — add notes while reading a paper.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentNotes.map((n) => (
                    <div
                      key={n.id}
                      className="w-full flex items-start gap-3 px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-left"
                    >
                      <svg className="mt-0.5 flex-shrink-0 w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text)] line-clamp-1">{n.content}</p>
                        {n.paper_title && (
                          <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                            {n.paper_title.length > 32 ? n.paper_title.slice(0, 32) + '…' : n.paper_title}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>

          {/* 3. Recommended For You */}
          {recommendations.length > 0 && (
            <section>
              <SectionHeader title="Recommended For You" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendations.map((paper, i) => (
                  <motion.div key={paper.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                    <RecCard paper={paper} isMastered={masteryMap[paper.id] ?? false} onSelect={() => onSelectPaper(paper)} />
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* 4. Today's Tasks + Friends — side by side on lg */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Today's Tasks */}
            {activePlan && todayTasks.length > 0 && onNavigateToRoadmap && (
              <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5">
                <SectionHeader
                  title="Today's Tasks"
                  action={<ViewAll onClick={onNavigateToRoadmap} label="Roadmap" />}
                />
                <ul className="space-y-2.5">
                  {todayTasks.map((t: StudyPlanTask) => {
                    const label =
                      (t.label?.trim()) ||
                      (t.type === 'reading' && t.section_heading) ||
                      (t.type === 'concept' && t.roadmap_node_id ? `Concept: ${t.roadmap_node_id}` : null) ||
                      (t.type === 'quiz' && t.paper_id ? `Quiz — paper #${t.paper_id}` : null) ||
                      t.type;
                    return (
                      <li key={t.id} className="flex items-center gap-3 text-sm">
                        <span
                          className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                          style={{ borderColor: t.status === 'done' ? 'var(--success)' : 'var(--border)' }}
                        >
                          {t.status === 'done' && (
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} style={{ color: 'var(--success)' }}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                        <span className={t.status === 'done' ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text)]'}>
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* From Your Friends */}
            {friendsInsights && (friendsInsights.trendingPapers?.length > 0 || (friendsInsights.mostActiveReadersByTime?.length ?? 0) > 0) && (
              <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5">
                <SectionHeader
                  title="From Your Friends"
                  action={onNavigateToFriends ? <ViewAll onClick={onNavigateToFriends} label="Friends" /> : undefined}
                />
                <div className="space-y-4">
                  {friendsInsights.trendingPapers && friendsInsights.trendingPapers.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2">Trending</p>
                      <ul className="space-y-1.5">
                        {friendsInsights.trendingPapers.slice(0, 4).map((p, i) => (
                          <li key={p.paperId} className="flex items-center gap-2">
                            <span className="text-xs text-[var(--text-muted)] w-4 font-mono">{i + 1}.</span>
                            <button type="button" onClick={() => onSelectPaper(p.paperId)} className="flex-1 text-sm text-left text-[var(--text)] hover:text-[var(--primary)] transition-colors truncate">
                              {p.title}
                            </button>
                            <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{p.readCount}×</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(friendsInsights.mostActiveReadersByTime?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2">Most Active</p>
                      <div className="flex flex-wrap gap-2">
                        {(friendsInsights.mostActiveReadersByTime ?? []).slice(0, 3).map((r) => (
                          <span key={r.userId} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-xs text-[var(--text)]">
                            <span className="font-medium">{r.name}</span>
                            <span className="text-[var(--text-muted)]">{r.formatted}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

        </div>
      )}
    </div>
  );
};

export default Home;
