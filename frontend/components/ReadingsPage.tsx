import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Paper, Course, CourseUploadResult } from '../types';
import { getRecommendations, searchPapers, getCategories, allAuthors, getMasteryBatch, uploadPaperPdf, createPaper, getCourses, createCourse, uploadBulkToCourse } from '../services/apiService';
import { extractTextFromFile } from '../services/fileExtractors';
import { LoaderIcon } from './icons/LoaderIcon';
import { SearchIcon } from './icons/SearchIcon';
import { XIcon } from './icons/XIcon';
import { Button } from './ui/Button';
import { Skeleton } from './ui/Skeleton';
import MyHighlights from './MyHighlights';
import MyNotes from './MyNotes';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { HighlighterIcon } from './icons/HighlighterIcon';
import { PencilIcon } from './icons/PencilIcon';

export type ReadingsTab = 'papers' | 'highlights' | 'notes' | 'courses';

const READING_PREVIEW_LIMIT = 8;

interface ReadingsPageProps {
  activeTab?: ReadingsTab;
  onTabChange: (tab: ReadingsTab) => void;
  onSelectPaper: (idOrPaper: string | Paper) => void;
  onSelectCourse?: (courseId: number) => void;
}

const CoursesIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <line x1="12" y1="7" x2="16" y2="7" /><line x1="12" y1="11" x2="16" y2="11" /><line x1="12" y1="15" x2="16" y2="15" />
  </svg>
);

const tabs: { id: ReadingsTab; label: string; description: string; icon: React.ReactNode }[] = [
  { id: 'papers', label: 'My Readings', description: 'Browse and filter all your saved papers and documents', icon: <BookOpenIcon className="w-7 h-7 text-[var(--primary)]" /> },
  { id: 'courses', label: 'My Courses', description: 'Group papers into courses — with AI overviews, roadmaps, and course quizzes', icon: <CoursesIcon className="w-7 h-7 text-[var(--primary)]" /> },
  { id: 'highlights', label: 'My Highlights', description: 'All your saved highlights across papers', icon: <HighlighterIcon className="w-7 h-7 text-[var(--primary)]" /> },
  { id: 'notes', label: 'My Notes', description: 'Notes and passage-linked thoughts from your readings', icon: <PencilIcon className="w-7 h-7 text-[var(--primary)]" /> },
];

const ReadingsPage: React.FC<ReadingsPageProps> = ({ activeTab, onTabChange, onSelectPaper, onSelectCourse }) => {
  const [selected, setSelected] = useState<ReadingsTab | undefined>(activeTab);

  // Sync when parent drives the tab externally (e.g. navbar deep-link)
  useEffect(() => {
    setSelected(activeTab);
  }, [activeTab]);

  const handleCardClick = (id: ReadingsTab) => {
    if (selected === id) {
      setSelected(undefined);
    } else {
      setSelected(id);
      onTabChange(id);
    }
  };

  const hasSelection = selected !== undefined;

  // ── Papers state ──────────────────────────────────────────────────────────
  const [recommendations, setRecommendations] = useState<Paper[]>([]);
  const [searchResults, setSearchResults] = useState<Paper[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [authors] = useState<string[]>(allAuthors);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ subject: '', author: '', startYear: '', endYear: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [masteryMap, setMasteryMap] = useState<Record<string, boolean>>({});
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'extracting' | 'saving'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Courses state ─────────────────────────────────────────────────────────
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [createCourseName, setCreateCourseName] = useState('');
  const [createCourseDesc, setCreateCourseDesc] = useState('');
  const [createCourseSyllabus, setCreateCourseSyllabus] = useState<File | null>(null);
  const [createCourseLoading, setCreateCourseLoading] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkUploadCourseId, setBulkUploadCourseId] = useState<number | null>(null);
  const [bulkUploadCourseName, setBulkUploadCourseName] = useState('');
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkUploadProgress, setBulkUploadProgress] = useState<CourseUploadResult[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const syllabusInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setUploadError(null);
    setUploadStatus('extracting');
    try {
      let paper: Paper;
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setUploadStatus('saving');
        paper = await uploadPaperPdf(file);
      } else {
        const { text, label } = await extractTextFromFile(file);
        if (!text?.trim()) { setUploadError('No text could be extracted.'); setUploadStatus('idle'); return; }
        const title = label.replace(/\.[^.]+$/, '') || 'Untitled document';
        const summary = text.trim().length > 400 ? text.trim().slice(0, 400) + '…' : text.trim();
        setUploadStatus('saving');
        paper = await createPaper({ title, authors: [], publicationYear: new Date().getFullYear(), subject: 'Uploaded', summary: summary || title, fullText: text.trim() });
      }
      setRecommendations(prev => [paper, ...prev.filter(p => p.id !== paper.id)]);
      onSelectPaper(paper);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadStatus('idle');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [onSelectPaper]);

  const loadCourses = useCallback(async () => {
    setCoursesLoading(true);
    try {
      const list = await getCourses();
      setCourses(list);
    } catch { /* ignore */ } finally {
      setCoursesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected === 'courses') loadCourses();
  }, [selected, loadCourses]);

  const handleCreateCourse = useCallback(async () => {
    if (!createCourseName.trim()) return;
    setCreateCourseLoading(true);
    try {
      const course = await createCourse({
        name: createCourseName.trim(),
        description: createCourseDesc.trim() || undefined,
        syllabusFile: createCourseSyllabus || undefined,
      });
      setShowCreateCourse(false);
      setCreateCourseName('');
      setCreateCourseDesc('');
      setCreateCourseSyllabus(null);
      setBulkUploadCourseId(course.id);
      setBulkUploadCourseName(course.name);
      setShowBulkUpload(true);
      setCourses(prev => [course, ...prev]);
    } catch (e: any) {
      alert(e.message || 'Failed to create course');
    } finally {
      setCreateCourseLoading(false);
    }
  }, [createCourseName, createCourseDesc, createCourseSyllabus]);

  const handleBulkUpload = useCallback(async () => {
    if (!bulkUploadCourseId || bulkFiles.length === 0) return;
    setBulkUploading(true);
    setBulkUploadProgress([]);
    try {
      const results = await uploadBulkToCourse(bulkUploadCourseId, bulkFiles);
      setBulkUploadProgress(results);
    } catch (e: any) {
      alert(e.message || 'Bulk upload failed');
    } finally {
      setBulkUploading(false);
    }
  }, [bulkUploadCourseId, bulkFiles]);

  const handleBulkDone = useCallback(() => {
    setShowBulkUpload(false);
    setBulkFiles([]);
    setBulkUploadProgress([]);
    if (bulkUploadCourseId && onSelectCourse) {
      onSelectCourse(bulkUploadCourseId);
    }
    loadCourses();
  }, [bulkUploadCourseId, onSelectCourse, loadCourses]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const cats = await getCategories();
        setCategories(cats);
        if (!searchQuery && !Object.values(filters).some(f => f)) {
          const recs = await getRecommendations(READING_PREVIEW_LIMIT);
          setRecommendations(recs);
        }
      } catch (error) {
        console.error("Failed to fetch initial data", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
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
      console.error("Search failed", error);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, filters]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch();
  };

  const clearSearchAndFilters = () => {
    setSearchQuery('');
    setFilters({ subject: '', author: '', startYear: '', endYear: '' });
    setSearchResults(null);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const papersToShow = searchResults !== null
    ? searchResults
    : recommendations.filter(p => !selectedCategory || p.subject === selectedCategory);
  const displayList = searchResults !== null ? papersToShow : papersToShow.slice(0, READING_PREVIEW_LIMIT);

  const displayIds = useMemo(() => displayList.map((p) => p.id).sort().join(','), [displayList]);
  useEffect(() => {
    if (displayList.length === 0) return;
    const ids = displayList.map((p) => p.id);
    getMasteryBatch(ids)
      .then((batch) => {
        const next: Record<string, boolean> = {};
        ids.forEach((id) => { next[id] = batch[id]?.is_mastered ?? false; });
        setMasteryMap(next);
      })
      .catch(() => {});
  }, [displayIds]);

  return (
    <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10">
      {/* Header + cards: shift to top when a tab is open, else center vertically */}
      <motion.div
        layout
        className={`flex flex-col items-center transition-all ${
          hasSelection ? 'pt-10 pb-6' : 'min-h-[calc(100vh-8rem)] justify-center'
        }`}
      >
        <motion.div layout className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display mb-2">Readings</h1>
          <p className="text-[var(--text-muted)]">Browse your papers and highlights in one place.</p>
        </motion.div>

        {/* Tab selector — full cards when idle, compact pill strip when active */}
        {hasSelection ? (
          <motion.div layout className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 w-fit">
            {tabs.map((tab) => {
              const isActive = selected === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleCardClick(tab.id)}
                  className="rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150"
                  style={isActive
                    ? { background: 'var(--gradient-primary)', color: '#fff' }
                    : { color: 'var(--text-muted)' }
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </motion.div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-5xl">
            {tabs.map((tab) => (
              <motion.button
                key={tab.id}
                type="button"
                layout
                onClick={() => handleCardClick(tab.id)}
                whileHover={{ y: -3, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="text-left rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-6 hover:border-[var(--primary)]/50 hover:bg-[var(--bg-secondary)]/50 transition-colors duration-200"
              >
                <div className="p-3 rounded-xl w-fit mb-3" style={{ background: 'var(--primary-light)' }}>
                  {tab.icon}
                </div>
                <h2 className="text-lg font-bold text-[var(--text)] font-display">{tab.label}</h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">{tab.description}</p>
              </motion.button>
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* Expanding content panel */}
      <AnimatePresence mode="wait">
        {selected && (
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="pb-16"
          >
            {selected === 'papers' && (
              <div>
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                />

                {/* Upload row */}
                <div className="flex items-center justify-between gap-4 mb-6 px-5 py-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)]">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)]">Add a paper to your library</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">Upload a PDF — text, highlights, and notes will all be linked to it.</p>
                    {uploadError && <p className="text-xs text-[var(--danger)] mt-1">{uploadError}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadStatus !== 'idle'}
                    className="flex-shrink-0 inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ background: 'var(--gradient-primary)' }}
                  >
                    {uploadStatus === 'idle' ? (
                      <>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        Upload PDF
                      </>
                    ) : (
                      <><LoaderIcon className="w-3.5 h-3.5 animate-spin" />{uploadStatus === 'extracting' ? 'Reading…' : 'Saving…'}</>
                    )}
                  </button>
                </div>

                {/* Browse by category */}
                <div className="mb-6">
                  <p className="text-sm font-medium text-[var(--text-muted)] mb-2">Browse by subject</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(null)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                        selectedCategory === null
                          ? 'text-white'
                          : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)]/50 hover:text-[var(--text)]'
                      }`}
                      style={selectedCategory === null ? { background: 'var(--gradient-primary)' } : {}}
                    >
                      All
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                          selectedCategory === cat
                            ? 'text-white'
                            : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)]/50 hover:text-[var(--text)]'
                        }`}
                        style={selectedCategory === cat ? { background: 'var(--gradient-primary)' } : {}}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search and filter */}
                <form onSubmit={handleFormSubmit} className="mb-6 flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px] max-w-md">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by keyword, author..."
                      className="w-full h-10 pl-9 pr-9 rounded-lg text-sm bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                    {(searchQuery || Object.values(filters).some(f => f)) && (
                      <button type="button" onClick={clearSearchAndFilters} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]">
                        <XIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <select name="subject" value={filters.subject} onChange={handleFilterChange} className="h-10 rounded-lg px-3 text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]">
                    <option value="">Subject</option>
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <select name="author" value={filters.author} onChange={handleFilterChange} className="h-10 rounded-lg px-3 text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]">
                    <option value="">Author</option>
                    {authors.map(author => <option key={author} value={author}>{author}</option>)}
                  </select>
                  <input type="number" name="startYear" value={filters.startYear} onChange={handleFilterChange} placeholder="From" className="w-20 h-10 rounded-lg px-3 text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
                  <input type="number" name="endYear" value={filters.endYear} onChange={handleFilterChange} placeholder="To" className="w-20 h-10 rounded-lg px-3 text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
                  <Button type="submit" variant="primary" size="md" className="min-h-[40px] h-10">Search</Button>
                </form>

                {isSearching ? (
                  <div className="flex justify-center items-center h-32">
                    <LoaderIcon className="w-8 h-8 animate-spin text-[var(--primary)]" />
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                    {searchResults !== null && (
                      <p className="px-4 py-2 text-sm text-[var(--text-muted)] border-b border-[var(--border)]">
                        Search results ({searchResults.length})
                      </p>
                    )}
                    {selectedCategory !== null && searchResults === null && (
                      <p className="px-4 py-2 text-sm text-[var(--text-muted)] border-b border-[var(--border)]">
                        {selectedCategory} ({displayList.length})
                      </p>
                    )}
                    {isLoading ? (
                      <div className="p-4 space-y-3">
                        {[...Array(8)].map((_, i) => (
                          <Skeleton key={i} height={20} width={i % 2 === 0 ? '90%' : '70%'} />
                        ))}
                      </div>
                    ) : displayList.length === 0 ? (
                      <p className="p-8 text-center text-[var(--text-muted)]">No readings match. Try another subject or search.</p>
                    ) : (
                      <ul className="divide-y divide-[var(--border)]">
                        {displayList.map((paper, i) => (
                          <li key={paper.id}>
                            <motion.button
                              type="button"
                              onClick={() => onSelectPaper(paper)}
                              className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-[var(--bg-secondary)]/50 transition-colors"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.03 }}
                            >
                              <span className="shrink-0 w-6 h-6 flex items-center justify-center" title={masteryMap[paper.id] ? 'Mastered' : 'Not mastered'}>
                                {masteryMap[paper.id] ? (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--success)' }}>
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                                    <circle cx="12" cy="12" r="10" />
                                  </svg>
                                )}
                              </span>
                              <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: 'var(--gradient-primary)' }}>
                                {paper.subject}
                              </span>
                              <span className="flex-1 min-w-0 font-semibold text-[var(--text)] truncate">{paper.title}</span>
                              <span className="shrink-0 text-sm text-[var(--text-muted)]">
                                {paper.authors.join(', ')} · {paper.publicationYear}
                              </span>
                              <span className="shrink-0 text-sm font-medium text-[var(--primary)]">Open →</span>
                            </motion.button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {selected === 'courses' && (
              <div className="space-y-5">
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-[var(--text)]">My Courses</h2>
                  <button
                    onClick={() => setShowCreateCourse(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: 'var(--gradient-primary)' }}
                  >
                    + New Course
                  </button>
                </div>

                {/* Course cards */}
                {coursesLoading ? (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-32 rounded-2xl border border-[var(--border)] bg-[var(--surface)] animate-pulse" />
                    ))}
                  </div>
                ) : courses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <p className="text-[var(--text-muted)] text-sm">No courses yet. Create one to group your papers.</p>
                    <button
                      onClick={() => setShowCreateCourse(true)}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                      style={{ background: 'var(--gradient-primary)' }}
                    >
                      Create your first course
                    </button>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {courses.map(course => (
                      <button
                        key={course.id}
                        onClick={() => onSelectCourse?.(course.id)}
                        className="text-left bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--primary)]/50 hover:bg-[var(--bg-secondary)]/50 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors truncate">{course.name}</h3>
                            {course.description && <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{course.description}</p>}
                          </div>
                          {course.status === 'creating' && (
                            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 animate-pulse">⚙</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                          <span>{course.paper_count} paper{course.paper_count !== 1 ? 's' : ''}</span>
                          {course.overview && <span className="text-green-400">✓ AI overview</span>}
                        </div>
                        <div className="mt-3 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--primary)] rounded-full" style={{ width: '0%' }} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Create Course Modal */}
                {showCreateCourse && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-[var(--text)]">Create a Course</h3>
                        <button onClick={() => setShowCreateCourse(false)} className="text-[var(--text-muted)] hover:text-[var(--text)] text-xl leading-none">×</button>
                      </div>
                      <div className="space-y-3">
                        <input
                          type="text"
                          placeholder="Course name *"
                          value={createCourseName}
                          onChange={e => setCreateCourseName(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]"
                          autoFocus
                        />
                        <textarea
                          placeholder="Description (optional)"
                          value={createCourseDesc}
                          onChange={e => setCreateCourseDesc(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)] resize-none"
                        />
                        <div>
                          <input
                            ref={syllabusInputRef}
                            type="file"
                            accept=".pdf,application/pdf"
                            className="hidden"
                            onChange={e => setCreateCourseSyllabus(e.target.files?.[0] || null)}
                          />
                          <button
                            type="button"
                            onClick={() => syllabusInputRef.current?.click()}
                            className="w-full py-2 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
                          >
                            {createCourseSyllabus ? `📄 ${createCourseSyllabus.name}` : '+ Upload Syllabus (optional PDF)'}
                          </button>
                          {createCourseSyllabus && (
                            <button onClick={() => setCreateCourseSyllabus(null)} className="text-xs text-red-400 mt-1">Remove syllabus</button>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setShowCreateCourse(false)}
                          className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleCreateCourse}
                          disabled={!createCourseName.trim() || createCourseLoading}
                          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                          style={{ background: 'var(--gradient-primary)' }}
                        >
                          {createCourseLoading ? 'Creating…' : 'Create & Add Papers →'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bulk Upload Modal */}
                {showBulkUpload && bulkUploadCourseId && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-[var(--text)]">Add Papers to "{bulkUploadCourseName}"</h3>
                        <button onClick={handleBulkDone} className="text-[var(--text-muted)] hover:text-[var(--text)] text-xl leading-none">×</button>
                      </div>

                      {bulkUploadProgress.length === 0 ? (
                        <>
                          <input
                            ref={bulkFileInputRef}
                            type="file"
                            accept=".pdf,application/pdf"
                            multiple
                            className="hidden"
                            onChange={e => setBulkFiles(Array.from(e.target.files || []))}
                          />
                          <div
                            className="border-2 border-dashed border-[var(--border)] rounded-xl p-8 text-center cursor-pointer hover:border-[var(--primary)] transition-colors"
                            onClick={() => bulkFileInputRef.current?.click()}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); setBulkFiles(Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.pdf'))); }}
                          >
                            <p className="text-[var(--text-muted)] text-sm">
                              {bulkFiles.length > 0
                                ? `${bulkFiles.length} PDF${bulkFiles.length > 1 ? 's' : ''} selected`
                                : 'Drop PDFs here or click to browse'
                              }
                            </p>
                            {bulkFiles.length > 0 && (
                              <div className="mt-3 text-xs text-[var(--text-muted)] space-y-0.5 max-h-32 overflow-y-auto">
                                {bulkFiles.map(f => <div key={f.name}>{f.name}</div>)}
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-muted)]">
                            After uploading, the system will automatically generate a course overview, suggest a reading order, and build a knowledge graph.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={handleBulkDone}
                              className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text-muted)]"
                            >
                              Skip for now
                            </button>
                            <button
                              onClick={handleBulkUpload}
                              disabled={bulkFiles.length === 0 || bulkUploading}
                              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                              style={{ background: 'var(--gradient-primary)' }}
                            >
                              {bulkUploading ? (
                                <span className="flex items-center justify-center gap-2">
                                  <LoaderIcon className="w-4 h-4 animate-spin" /> Uploading…
                                </span>
                              ) : `Upload ${bulkFiles.length > 0 ? bulkFiles.length : ''} PDF${bulkFiles.length !== 1 ? 's' : ''}`}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {bulkUploadProgress.map((r, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <span className={r.status === 'ok' ? 'text-green-400' : 'text-red-400'}>{r.status === 'ok' ? '✓' : '✗'}</span>
                                <span className="flex-1 truncate text-[var(--text)]">{r.filename}</span>
                                {r.status === 'error' && <span className="text-xs text-red-400">{r.detail?.slice(0, 40)}</span>}
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-[var(--text-muted)]">
                            ✦ AI is now generating your course overview, reading order, and knowledge graph in the background.
                          </p>
                          <button
                            onClick={handleBulkDone}
                            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
                            style={{ background: 'var(--gradient-primary)' }}
                          >
                            Open Course Dashboard →
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selected === 'highlights' && (
              <div className="mt-4">
                <MyHighlights onSelectPaper={onSelectPaper} />
              </div>
            )}

            {selected === 'notes' && <MyNotes onSelectPaper={onSelectPaper} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ReadingsPage;
