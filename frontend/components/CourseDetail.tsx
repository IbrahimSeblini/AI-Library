import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Course, CourseProgress, Highlight, Note, Paper } from '../types';
import {
    getCourse, getCourseProgress, getCourseHighlights, getCourseNotes,
    getCourseFullPapers, getCourseRoadmap, generateCourseRoadmap,
    getCourseStudyPlan, generateCourseStudyPlan,
    generateCourseOverview, generateCourseReadingOrder,
    removePaperFromCourse, generateCourseQuiz,
    searchPapers, addPaperToCourse, uploadBulkToCourse, regenerateCourse,
} from '../services/apiService';
import { generateQuizFromText } from '../services/quizService';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CourseDetailProps {
    courseId: number;
    user: { id: string; name: string; email: string };
    onBack: () => void;
    onSelectPaper: (id: string, context?: { courseId: number; courseTitle: string; position: number; total: number; coursePaperIds: string[] }) => void;
    onViewRoadmap?: (courseId: number) => void;
}

type CourseTab = 'overview' | 'papers' | 'highlights' | 'notes' | 'quiz';

interface QuizQuestion {
    id: string;
    question: string;
    options: string[];
    answerIndex: number;
    difficulty: string;
    explanation?: string;
    source_paper?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 72 }: { pct: number; size?: number }) {
    const r = (size - 8) / 2;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    return (
        <svg width={size} height={size} className="rotate-[-90deg]">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} className="stroke-[var(--border)]" />
            <circle
                cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6}
                strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                className="stroke-[var(--primary)] transition-all duration-700"
            />
        </svg>
    );
}

function MasteryDot({ state }: { state: number }) {
    const colors = ['', 'bg-gray-400', 'bg-blue-400', 'bg-yellow-400', 'bg-green-500'];
    return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[Math.min(state, 4)] || 'bg-gray-400'}`} />;
}

function Skeleton({ className = '' }: { className?: string }) {
    return <div className={`animate-pulse bg-[var(--border)] rounded ${className}`} />;
}

const COURSE_TABS: Array<{ id: CourseTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'papers', label: 'Papers' },
    { id: 'highlights', label: 'Highlights' },
    { id: 'notes', label: 'Notes' },
    { id: 'quiz', label: 'Quiz' },
];

// ── Main component ─────────────────────────────────────────────────────────────

const CourseDetail: React.FC<CourseDetailProps> = ({ courseId, user, onBack, onSelectPaper, onViewRoadmap }) => {
    const [course, setCourse] = useState<Course | null>(null);
    const [progress, setProgress] = useState<CourseProgress | null>(null);
    const [fullPapers, setFullPapers] = useState<Paper[]>([]);
    const [highlights, setHighlights] = useState<Highlight[]>([]);
    const [notes, setNotes] = useState<Note[]>([]);
    const [activeTab, setActiveTab] = useState<CourseTab>('overview');
    const [isLoading, setIsLoading] = useState(true);

    // Add paper to course
    const [showAddPaper, setShowAddPaper] = useState(false);
    const [paperSearch, setPaperSearch] = useState('');
    const [paperSearchResults, setPaperSearchResults] = useState<Paper[]>([]);
    const [addingPaperId, setAddingPaperId] = useState<string | null>(null);

    // Quiz state
    const [quizMode, setQuizMode] = useState<'pick' | 'full' | 'adaptive' | 'running' | 'done'>('pick');
    const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
    const [quizIdx, setQuizIdx] = useState(0);
    const [quizSelected, setQuizSelected] = useState<number | null>(null);
    const [quizAnswers, setQuizAnswers] = useState<boolean[]>([]);
    const [quizLoading, setQuizLoading] = useState(false);
    const [quizNQ, setQuizNQ] = useState(10);

    // Polling for course status
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadCourse = useCallback(async () => {
        try {
            const c = await getCourse(courseId);
            setCourse(c);
            return c;
        } catch (e) {
            console.error('Failed to load course', e);
            return null;
        }
    }, [courseId]);

    const loadAll = useCallback(async () => {
        setIsLoading(true);
        try {
            const [c, prog, papers] = await Promise.all([
                getCourse(courseId),
                getCourseProgress(courseId).catch(() => null),
                getCourseFullPapers(courseId).catch(() => []),
            ]);
            setCourse(c);
            setProgress(prog);
            setFullPapers(papers as Paper[]);
        } finally {
            setIsLoading(false);
        }
    }, [courseId]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    // Poll while course is still in "creating" status
    useEffect(() => {
        if (!course) return;
        if (course.status === 'creating') {
            pollRef.current = setInterval(async () => {
                const c = await loadCourse();
                if (c && c.status !== 'creating') {
                    clearInterval(pollRef.current!);
                    setCourse(c);
                    // Reload full data once ready
                    getCourseFullPapers(courseId).then(p => setFullPapers(p as Paper[])).catch(() => {});
                    getCourseProgress(courseId).then(setProgress).catch(() => {});
                }
            }, 4000);
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [course?.status, courseId, loadCourse]);

    // Load tab-specific data
    useEffect(() => {
        if (activeTab === 'highlights' && highlights.length === 0) {
            getCourseHighlights(courseId).then(setHighlights).catch(() => {});
        }
        if (activeTab === 'notes' && notes.length === 0) {
            getCourseNotes(courseId).then(setNotes).catch(() => {});
        }
    }, [activeTab, courseId]);

    // Paper search
    useEffect(() => {
        if (!paperSearch.trim()) { setPaperSearchResults([]); return; }
        const t = setTimeout(async () => {
            try {
                const results = await searchPapers(paperSearch);
                setPaperSearchResults(results.slice(0, 6));
            } catch { setPaperSearchResults([]); }
        }, 300);
        return () => clearTimeout(t);
    }, [paperSearch]);

    const handleAddPaper = async (paper: Paper) => {
        setAddingPaperId(paper.id);
        try {
            await addPaperToCourse(courseId, parseInt(paper.id), paper.title);
            await loadAll();
            setPaperSearch('');
            setPaperSearchResults([]);
            setShowAddPaper(false);
        } catch (e: any) {
            alert(e.message || 'Failed to add paper');
        } finally {
            setAddingPaperId(null);
        }
    };

    const handleRemovePaper = async (paperId: string) => {
        if (!confirm('Remove this paper from the course? It stays in your library.')) return;
        try {
            await removePaperFromCourse(courseId, parseInt(paperId));
            await loadAll();
        } catch { alert('Failed to remove paper'); }
    };

    const handleRegenerateOverview = async () => {
        if (!course) return;
        setCourse(prev => prev ? { ...prev, overview: null } : prev);
        try {
            const res = await generateCourseOverview(courseId);
            setCourse(prev => prev ? { ...prev, overview: res.overview } : prev);
        } catch { alert('Failed to generate overview'); }
    };

    const handleRegenerateAll = async () => {
        if (!course) return;
        if (!confirm('Re-run the full AI pipeline? This will re-apply the syllabus, re-order readings, regenerate the overview, and update the study plan.')) return;
        try {
            await regenerateCourse(courseId);
            setCourse(prev => prev ? { ...prev, status: 'creating' } : prev);
            // Poll until ready
            const poll = setInterval(async () => {
                const updated = await getCourse(courseId);
                setCourse(updated);
                if (updated.status !== 'creating') {
                    clearInterval(poll);
                    await loadAll();
                }
            }, 3000);
        } catch { alert('Failed to trigger regeneration'); }
    };

    // ── Quiz logic ──

    const startCourseQuiz = async (mode: 'full' | 'adaptive') => {
        setQuizLoading(true);
        setQuizMode(mode);
        try {
            let papersForQuiz = fullPapers;
            if (mode === 'adaptive') {
                // Use papers with lower mastery first (simplification: those without fullText cached)
                papersForQuiz = [...fullPapers].slice(0, 6);
            }
            const paperInputs = papersForQuiz
                .filter(p => p.fullText && p.fullText.length > 100)
                .slice(0, 8)
                .map(p => ({ title: p.title, text: (p.fullText || '').slice(0, 3000) }));

            if (!paperInputs.length) {
                alert('No paper content available for quiz generation.');
                setQuizMode('pick');
                return;
            }

            const questions = await generateCourseQuiz(paperInputs, quizNQ);
            setQuizQuestions(questions);
            setQuizIdx(0);
            setQuizSelected(null);
            setQuizAnswers([]);
            setQuizMode('running');
        } catch (e: any) {
            alert(e.message || 'Quiz generation failed');
            setQuizMode('pick');
        } finally {
            setQuizLoading(false);
        }
    };

    const handleQuizAnswer = (idx: number) => {
        if (quizSelected !== null) return;
        setQuizSelected(idx);
        const correct = idx === quizQuestions[quizIdx].answerIndex;
        setQuizAnswers(prev => [...prev, correct]);
    };

    const nextQuestion = () => {
        if (quizIdx + 1 >= quizQuestions.length) {
            setQuizMode('done');
        } else {
            setQuizIdx(i => i + 1);
            setQuizSelected(null);
        }
    };

    // ── Render helpers ──

    const orderedPapers = React.useMemo(() => {
        if (!course || !fullPapers.length) return fullPapers;
        if (course.reading_order) {
            const orderMap = new Map(course.reading_order.map((id, i) => [String(id), i]));
            return [...fullPapers].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
        }
        return fullPapers;
    }, [fullPapers, course?.reading_order]);

    const highlightsByPaper = React.useMemo(() => {
        const map: Record<string, Highlight[]> = {};
        highlights.forEach(h => {
            const key = String(h.paper_id);
            if (!map[key]) map[key] = [];
            map[key].push(h);
        });
        return map;
    }, [highlights]);

    const notesByPaper = React.useMemo(() => {
        const map: Record<string, Note[]> = {};
        notes.forEach(n => {
            const key = String(n.paper_id);
            if (!map[key]) map[key] = [];
            map[key].push(n);
        });
        return map;
    }, [notes]);

    const colorDot: Record<string, string> = {
        yellow: '#FBBF24', green: '#34D399', blue: '#60A5FA', pink: '#F472B6',
        orange: '#FB923C', purple: '#A78BFA', teal: '#2DD4BF', red: '#F87171',
        cyan: '#22D3EE', lime: '#A3E635',
    };

    if (isLoading) {
        return (
            <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-8 space-y-6">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    if (!course) {
        return (
            <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-16 text-center">
                <p className="text-[var(--text-muted)]">Course not found.</p>
                <button onClick={onBack} className="mt-4 text-[var(--primary)] underline">← Back</button>
            </div>
        );
    }

    const completionPct = progress?.completion_pct ?? 0;

    return (
        <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-8 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
                <button
                    onClick={onBack}
                    className="mt-1 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm flex items-center gap-1"
                >
                    ← Back
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text)] font-display truncate">{course.name}</h1>
                        {course.status === 'creating' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 animate-pulse">
                                ⚙ Generating…
                            </span>
                        )}
                        {course.status === 'ready' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                                ✓ Ready
                            </span>
                        )}
                    </div>
                    {course.description && (
                        <p className="mt-1 text-sm text-[var(--text-muted)]">{course.description}</p>
                    )}
                </div>

                {/* Progress ring */}
                <div className="flex flex-col items-center shrink-0">
                    <div className="relative">
                        <ProgressRing pct={completionPct} />
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[var(--text)]">
                            {Math.round(completionPct)}%
                        </span>
                    </div>
                    <span className="text-xs text-[var(--text-muted)] mt-1">
                        {progress?.papers_mastered ?? 0}/{progress?.total_papers ?? course.paper_count} mastered
                    </span>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Papers', value: course.paper_count },
                    { label: 'Read', value: progress?.papers_read ?? '—' },
                    { label: 'Mastered', value: progress?.papers_mastered ?? '—' },
                    { label: 'Highlights', value: highlights.length || '—' },
                ].map(s => (
                    <div key={s.label} className="bg-[var(--surface)] rounded-xl p-3 text-center border border-[var(--border)]">
                        <div className="text-xl font-bold text-[var(--primary)]">{s.value}</div>
                        <div className="text-xs text-[var(--text-muted)]">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-1 border-b border-[var(--border)] mb-2">
                {COURSE_TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                            activeTab === tab.id
                                ? 'border-[var(--primary)] text-[var(--primary)]'
                                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
                <OverviewTab
                    course={course}
                    orderedPapers={orderedPapers}
                    onSelectPaper={(id, pos) => onSelectPaper(id, { courseId, courseTitle: course.name, position: pos, total: orderedPapers.length, coursePaperIds: orderedPapers.map(p => p.id) })}
                    onRegenerateOverview={handleRegenerateOverview}
                    onRegenerateAll={handleRegenerateAll}
                    onViewRoadmap={onViewRoadmap ? () => onViewRoadmap(courseId) : undefined}
                />
            )}

            {activeTab === 'papers' && (
                <PapersTab
                    course={course}
                    orderedPapers={orderedPapers}
                    showAddPaper={showAddPaper}
                    setShowAddPaper={setShowAddPaper}
                    paperSearch={paperSearch}
                    setPaperSearch={setPaperSearch}
                    paperSearchResults={paperSearchResults}
                    addingPaperId={addingPaperId}
                    onSelectPaper={(id, pos) => onSelectPaper(id, { courseId, courseTitle: course.name, position: pos, total: orderedPapers.length, coursePaperIds: orderedPapers.map(p => p.id) })}
                    onAddPaper={handleAddPaper}
                    onRemovePaper={handleRemovePaper}
                    onUploadDone={loadAll}
                />
            )}

            {activeTab === 'highlights' && (
                <HighlightsTab
                    highlightsByPaper={highlightsByPaper}
                    fullPapers={fullPapers}
                    colorDot={colorDot}
                    onSelectPaper={(id, pos) => onSelectPaper(id, { courseId, courseTitle: course.name, position: pos, total: orderedPapers.length, coursePaperIds: orderedPapers.map(p => p.id) })}
                    orderedPapers={orderedPapers}
                />
            )}

            {activeTab === 'notes' && (
                <NotesTab
                    notesByPaper={notesByPaper}
                    fullPapers={fullPapers}
                    onSelectPaper={(id, pos) => onSelectPaper(id, { courseId, courseTitle: course.name, position: pos, total: orderedPapers.length, coursePaperIds: orderedPapers.map(p => p.id) })}
                    orderedPapers={orderedPapers}
                />
            )}

            {activeTab === 'quiz' && (
                <QuizTab
                    mode={quizMode}
                    questions={quizQuestions}
                    questionIdx={quizIdx}
                    selected={quizSelected}
                    answers={quizAnswers}
                    loading={quizLoading}
                    nQuestions={quizNQ}
                    setNQuestions={setQuizNQ}
                    orderedPapers={orderedPapers}
                    onStart={startCourseQuiz}
                    onAnswer={handleQuizAnswer}
                    onNext={nextQuestion}
                    onReset={() => { setQuizMode('pick'); setQuizQuestions([]); setQuizAnswers([]); }}
                    onSelectPaper={(id, pos) => onSelectPaper(id, { courseId, courseTitle: course.name, position: pos, total: orderedPapers.length, coursePaperIds: orderedPapers.map(p => p.id) })}
                />
            )}
        </div>
    );
};

// ── Reading order list (groups by week/section when syllabus data present) ─────

const ReadingOrderList: React.FC<{
    papers: Paper[];
    onSelectPaper: (id: string, pos: number) => void;
}> = ({ papers, onSelectPaper }) => {
    // Detect whether any paper has syllabus metadata
    const hasSyllabus = papers.some(p => (p as any).sectionName);

    if (!hasSyllabus) {
        // Simple flat list
        return (
            <div className="space-y-2">
                {papers.map((paper, idx) => (
                    <button
                        key={paper.id}
                        onClick={() => onSelectPaper(paper.id, idx)}
                        className="w-full flex items-center gap-3 bg-[var(--surface)] hover:bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-4 py-3 text-left transition-colors"
                    >
                        <span className="text-sm font-bold text-[var(--text-muted)] w-6 shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--text)] truncate">{paper.title}</p>
                            {paper.authors && paper.authors.length > 0 && (
                                <p className="text-xs text-[var(--text-muted)] truncate">{paper.authors.join(', ')}</p>
                            )}
                        </div>
                        <span className="text-[var(--text-muted)] text-sm">→</span>
                    </button>
                ))}
            </div>
        );
    }

    // Group by section name, preserving paper order within each group
    const groups: { label: string; week: number | null; papers: { paper: Paper; globalIdx: number }[] }[] = [];
    const seen = new Map<string, number>(); // label → groups index

    papers.forEach((paper, idx) => {
        const section: string = (paper as any).sectionName || 'Other Readings';
        const week: number | null = (paper as any).weekNumber ?? null;
        if (!seen.has(section)) {
            seen.set(section, groups.length);
            groups.push({ label: section, week, papers: [] });
        }
        groups[seen.get(section)!].papers.push({ paper, globalIdx: idx });
    });

    return (
        <div className="space-y-5">
            {groups.map(group => (
                <div key={group.label}>
                    <div className="flex items-center gap-2 mb-2">
                        {group.week !== null && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--primary)]/15 text-[var(--primary)]">
                                Week {group.week}
                            </span>
                        )}
                        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                            {group.label}
                        </span>
                    </div>
                    <div className="space-y-2 pl-2 border-l-2 border-[var(--border)]">
                        {group.papers.map(({ paper, globalIdx }) => (
                            <button
                                key={paper.id}
                                onClick={() => onSelectPaper(paper.id, globalIdx)}
                                className="w-full flex items-center gap-3 bg-[var(--surface)] hover:bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-4 py-3 text-left transition-colors"
                            >
                                <span className="text-sm font-bold text-[var(--text-muted)] w-6 shrink-0">{globalIdx + 1}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[var(--text)] truncate">{paper.title}</p>
                                    {paper.authors && paper.authors.length > 0 && (
                                        <p className="text-xs text-[var(--text-muted)] truncate">{paper.authors.join(', ')}</p>
                                    )}
                                </div>
                                <span className="text-[var(--text-muted)] text-sm">→</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

// ── Overview Tab ───────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{
    course: Course;
    orderedPapers: Paper[];
    onSelectPaper: (id: string, pos: number) => void;
    onRegenerateOverview: () => void;
    onRegenerateAll: () => void;
    onViewRoadmap?: () => void;
}> = ({ course, orderedPapers, onSelectPaper, onRegenerateOverview, onRegenerateAll, onViewRoadmap }) => {
    const isGenerating = course.status === 'creating';

    return (
        <div className="space-y-6">
            {/* AI Overview */}
            <div className="bg-[var(--surface)] rounded-2xl p-5 border border-[var(--border)]">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-[var(--text)] flex items-center gap-2">
                        ✦ Course Overview
                    </h2>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onRegenerateAll}
                            disabled={isGenerating}
                            title="Re-apply syllabus, re-order readings, regenerate overview and study plan"
                            className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors disabled:opacity-40"
                        >
                            {isGenerating ? 'Updating…' : '↺ Regenerate Plan'}
                        </button>
                        <button
                            onClick={onRegenerateOverview}
                            className="text-xs text-[var(--primary)] hover:underline"
                        >
                            Regenerate overview
                        </button>
                    </div>
                </div>
                {isGenerating && !course.overview ? (
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-4/6" />
                    </div>
                ) : course.overview ? (
                    <p className="text-sm text-[var(--text)] leading-relaxed">{course.overview}</p>
                ) : (
                    <p className="text-sm text-[var(--text-muted)] italic">
                        No overview yet.{' '}
                        <button onClick={onRegenerateOverview} className="text-[var(--primary)] underline">Generate one</button>
                    </p>
                )}
            </div>

            {/* Suggested reading order */}
            <div>
                <h2 className="font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
                    📖 Reading Order
                    {isGenerating && !course.reading_order && (
                        <span className="text-xs text-yellow-400 animate-pulse">Determining order…</span>
                    )}
                </h2>
                {orderedPapers.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">No papers in this course yet.</p>
                ) : (
                    <ReadingOrderList papers={orderedPapers} onSelectPaper={onSelectPaper} />
                )}
            </div>

            {/* Knowledge map link */}
            {onViewRoadmap && (
                <button
                    onClick={onViewRoadmap}
                    className="w-full flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] rounded-2xl px-5 py-4 text-left transition-colors group"
                >
                    <div>
                        <p className="font-semibold text-[var(--text)] text-sm group-hover:text-[var(--primary)] transition-colors">
                            🗺 Course Knowledge Map
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            See how concepts from your readings connect — click any node to see which papers cover it
                        </p>
                    </div>
                    <span className="text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors text-lg ml-3">→</span>
                </button>
            )}
        </div>
    );
};

// ── Papers Tab ─────────────────────────────────────────────────────────────────

const PapersTab: React.FC<{
    course: Course;
    orderedPapers: Paper[];
    showAddPaper: boolean;
    setShowAddPaper: (v: boolean) => void;
    paperSearch: string;
    setPaperSearch: (v: string) => void;
    paperSearchResults: Paper[];
    addingPaperId: string | null;
    onSelectPaper: (id: string, pos: number) => void;
    onAddPaper: (p: Paper) => void;
    onRemovePaper: (id: string) => void;
    onUploadDone: () => void;
}> = ({ course, orderedPapers, showAddPaper, setShowAddPaper, paperSearch, setPaperSearch, paperSearchResults, addingPaperId, onSelectPaper, onAddPaper, onRemovePaper, onUploadDone }) => {
    const existingIds = new Set(course.papers.map(cp => String(cp.paper_id)));
    const uploadRef = useRef<HTMLInputElement>(null);
    const [uploadResults, setUploadResults] = useState<{ name: string; ok: boolean; title?: string }[]>([]);
    const [uploading, setUploading] = useState(false);

    const handleUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        setUploadResults([]);
        try {
            const results = await uploadBulkToCourse(course.id, Array.from(files));
            setUploadResults(results.map(r => ({ name: r.filename, ok: r.status === 'ok', title: r.title })));
            onUploadDone();
        } catch (e: any) {
            setUploadResults([{ name: 'Upload failed', ok: false }]);
        } finally {
            setUploading(false);
            if (uploadRef.current) uploadRef.current.value = '';
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="font-semibold text-[var(--text)]">{orderedPapers.length} papers</h2>
                <div className="flex items-center gap-2">
                    {/* Upload new PDF directly into this course */}
                    <input
                        ref={uploadRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        multiple
                        className="hidden"
                        onChange={e => handleUpload(e.target.files)}
                    />
                    <button
                        onClick={() => uploadRef.current?.click()}
                        disabled={uploading}
                        className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] font-medium transition-colors disabled:opacity-50"
                    >
                        {uploading ? 'Uploading…' : '↑ Upload PDF'}
                    </button>
                    <button
                        onClick={() => setShowAddPaper(!showAddPaper)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90 transition-opacity"
                    >
                        + Add from Library
                    </button>
                </div>
            </div>

            {/* Upload results */}
            {uploadResults.length > 0 && (
                <div className="space-y-1">
                    {uploadResults.map((r, i) => (
                        <div key={i} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${r.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                            <span>{r.ok ? '✓' : '✗'}</span>
                            <span className="truncate">{r.ok ? (r.title || r.name) : r.name}</span>
                        </div>
                    ))}
                </div>
            )}

            {showAddPaper && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                    <input
                        type="text"
                        placeholder="Search your library…"
                        value={paperSearch}
                        onChange={e => setPaperSearch(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]"
                        autoFocus
                    />
                    {paperSearchResults.length > 0 && (
                        <div className="space-y-1">
                            {paperSearchResults.map(p => {
                                const alreadyIn = existingIds.has(p.id);
                                return (
                                    <button
                                        key={p.id}
                                        disabled={alreadyIn || addingPaperId === p.id}
                                        onClick={() => !alreadyIn && onAddPaper(p)}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-secondary)] text-left disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-[var(--text)] truncate">{p.title}</p>
                                            <p className="text-xs text-[var(--text-muted)] truncate">{p.authors?.join(', ')}</p>
                                        </div>
                                        {alreadyIn ? (
                                            <span className="text-xs text-green-400">✓ Added</span>
                                        ) : addingPaperId === p.id ? (
                                            <span className="text-xs text-[var(--text-muted)]">Adding…</span>
                                        ) : (
                                            <span className="text-xs text-[var(--primary)]">+ Add</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-2">
                {orderedPapers.map((paper, idx) => (
                    <div key={paper.id} className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
                        <span className="text-sm font-bold text-[var(--text-muted)] w-6 shrink-0">{idx + 1}</span>
                        <button
                            onClick={() => onSelectPaper(paper.id, idx)}
                            className="flex-1 min-w-0 text-left"
                        >
                            <p className="text-sm font-medium text-[var(--text)] truncate hover:text-[var(--primary)] transition-colors">{paper.title}</p>
                            <p className="text-xs text-[var(--text-muted)] truncate">{paper.authors?.join(', ')} {paper.publicationYear ? `· ${paper.publicationYear}` : ''}</p>
                        </button>
                        {(paper as any).sectionName && (
                            <span className="text-xs px-2 py-0.5 bg-[var(--primary)]/10 text-[var(--primary)] rounded-full shrink-0">
                                {(paper as any).sectionName}
                            </span>
                        )}
                        <button
                            onClick={() => onRemovePaper(paper.id)}
                            className="shrink-0 text-[var(--text-muted)] hover:text-red-400 transition-colors text-lg leading-none"
                            title="Remove from course"
                        >
                            ×
                        </button>
                    </div>
                ))}
                {orderedPapers.length === 0 && (
                    <p className="text-sm text-[var(--text-muted)] text-center py-8">
                        No papers yet. Add some from your library above.
                    </p>
                )}
            </div>
        </div>
    );
};

// ── Highlights Tab ─────────────────────────────────────────────────────────────

const HighlightsTab: React.FC<{
    highlightsByPaper: Record<string, Highlight[]>;
    fullPapers: Paper[];
    colorDot: Record<string, string>;
    onSelectPaper: (id: string, pos: number) => void;
    orderedPapers: Paper[];
}> = ({ highlightsByPaper, fullPapers, colorDot, onSelectPaper, orderedPapers }) => {
    const paperMap = new Map(fullPapers.map((p, i) => [p.id, { paper: p, idx: i }]));
    const paperIds = Object.keys(highlightsByPaper);

    if (paperIds.length === 0) {
        return <p className="text-sm text-[var(--text-muted)] text-center py-8">No highlights yet in this course.</p>;
    }

    return (
        <div className="space-y-6">
            {paperIds.map(pid => {
                const entry = paperMap.get(pid);
                const highlights = highlightsByPaper[pid];
                return (
                    <div key={pid} className="space-y-2">
                        <button
                            onClick={() => entry && onSelectPaper(pid, entry.idx)}
                            className="font-medium text-[var(--text)] hover:text-[var(--primary)] transition-colors text-sm"
                        >
                            {entry?.paper.title ?? `Paper #${pid}`} →
                        </button>
                        <div className="space-y-1.5 pl-2">
                            {highlights.map(h => (
                                <div
                                    key={h.id}
                                    className="flex items-start gap-2 text-sm text-[var(--text)] bg-[var(--surface)] rounded-lg px-3 py-2 border border-[var(--border)]"
                                >
                                    <span
                                        className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: colorDot[h.color] || '#888' }}
                                    />
                                    <span className="italic">"{h.highlighted_text}"</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ── Notes Tab ─────────────────────────────────────────────────────────────────

const NotesTab: React.FC<{
    notesByPaper: Record<string, Note[]>;
    fullPapers: Paper[];
    onSelectPaper: (id: string, pos: number) => void;
    orderedPapers: Paper[];
}> = ({ notesByPaper, fullPapers, onSelectPaper, orderedPapers }) => {
    const paperMap = new Map(fullPapers.map((p, i) => [p.id, { paper: p, idx: i }]));
    const paperIds = Object.keys(notesByPaper);

    if (paperIds.length === 0) {
        return <p className="text-sm text-[var(--text-muted)] text-center py-8">No notes yet in this course.</p>;
    }

    return (
        <div className="space-y-6">
            {paperIds.map(pid => {
                const entry = paperMap.get(pid);
                const pnotes = notesByPaper[pid];
                return (
                    <div key={pid} className="space-y-2">
                        <button
                            onClick={() => entry && onSelectPaper(pid, entry.idx)}
                            className="font-medium text-[var(--text)] hover:text-[var(--primary)] transition-colors text-sm"
                        >
                            {entry?.paper.title ?? `Paper #${pid}`} →
                        </button>
                        <div className="space-y-1.5 pl-2">
                            {pnotes.map(n => (
                                <div key={n.id} className="bg-[var(--surface)] rounded-lg px-3 py-2 border border-[var(--border)] text-sm">
                                    {n.selected_text && (
                                        <p className="text-[var(--text-muted)] italic text-xs mb-1">"{n.selected_text.slice(0, 80)}…"</p>
                                    )}
                                    <p className="text-[var(--text)]">{n.content}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ── Quiz Tab ──────────────────────────────────────────────────────────────────

const QuizTab: React.FC<{
    mode: 'pick' | 'full' | 'adaptive' | 'running' | 'done';
    questions: QuizQuestion[];
    questionIdx: number;
    selected: number | null;
    answers: boolean[];
    loading: boolean;
    nQuestions: number;
    setNQuestions: (n: number) => void;
    orderedPapers: Paper[];
    onStart: (mode: 'full' | 'adaptive') => void;
    onAnswer: (idx: number) => void;
    onNext: () => void;
    onReset: () => void;
    onSelectPaper: (id: string, pos: number) => void;
}> = ({ mode, questions, questionIdx, selected, answers, loading, nQuestions, setNQuestions, orderedPapers, onStart, onAnswer, onNext, onReset, onSelectPaper }) => {
    if (mode === 'pick') {
        return (
            <div className="space-y-6">
                <p className="text-sm text-[var(--text-muted)]">Choose your quiz mode for this course.</p>

                <div className="grid sm:grid-cols-2 gap-4">
                    {/* Per-paper quick quiz */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
                        <h3 className="font-semibold text-[var(--text)]">Quick — Per Paper</h3>
                        <p className="text-sm text-[var(--text-muted)]">
                            Take a 5-question quiz for any individual paper in the course.
                        </p>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {orderedPapers.map((p, i) => (
                                <button
                                    key={p.id}
                                    onClick={() => onSelectPaper(p.id, i)}
                                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--bg-secondary)] text-sm text-[var(--text)] transition-colors border border-transparent hover:border-[var(--border)]"
                                >
                                    {i + 1}. {p.title}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Full course exam */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
                        <h3 className="font-semibold text-[var(--text)]">Full Course Exam</h3>
                        <p className="text-sm text-[var(--text-muted)]">
                            Generate questions drawn from all papers in the course. Like a final exam.
                        </p>
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-[var(--text-muted)]">Questions:</label>
                            <select
                                value={nQuestions}
                                onChange={e => setNQuestions(Number(e.target.value))}
                                className="flex-1 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm"
                            >
                                {[5, 10, 15, 20, 30].map(n => <option key={n} value={n}>{n} questions</option>)}
                            </select>
                        </div>
                        <button
                            onClick={() => onStart('full')}
                            disabled={loading || orderedPapers.length === 0}
                            className="w-full py-2 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                            {loading ? 'Generating…' : 'Start Exam'}
                        </button>
                    </div>
                </div>

                {/* Adaptive */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="font-semibold text-[var(--text)]">Adaptive — Focus on Weak Areas</h3>
                            <p className="text-sm text-[var(--text-muted)] mt-1">
                                Quiz focuses on papers you haven't mastered yet. Great for review sessions.
                            </p>
                        </div>
                        <button
                            onClick={() => onStart('adaptive')}
                            disabled={loading || orderedPapers.length === 0}
                            className="shrink-0 px-4 py-2 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
                        >
                            {loading ? 'Generating…' : 'Start'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[var(--text-muted)]">Generating course quiz…</p>
            </div>
        );
    }

    if (mode === 'done') {
        const correct = answers.filter(Boolean).length;
        const pct = Math.round((correct / answers.length) * 100);
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                <div className="text-5xl">{pct >= 70 ? '🎉' : pct >= 40 ? '📚' : '💪'}</div>
                <h2 className="text-2xl font-bold text-[var(--text)]">{correct}/{answers.length} correct</h2>
                <p className="text-[var(--text-muted)]">{pct}% score on this course quiz</p>
                <button
                    onClick={onReset}
                    className="mt-2 px-5 py-2 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90"
                >
                    Try Again
                </button>
            </div>
        );
    }

    if (mode === 'running' && questions.length > 0) {
        const q = questions[questionIdx];
        return (
            <div className="space-y-5 max-w-2xl mx-auto">
                {/* Progress */}
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>Question {questionIdx + 1} of {questions.length}</span>
                    <span>{answers.filter(Boolean).length} correct so far</span>
                </div>
                <div className="h-1.5 bg-[var(--border)] rounded-full">
                    <div
                        className="h-full bg-[var(--primary)] rounded-full transition-all"
                        style={{ width: `${((questionIdx + 1) / questions.length) * 100}%` }}
                    />
                </div>

                {q.source_paper && (
                    <p className="text-xs text-[var(--text-muted)] italic">From: {q.source_paper}</p>
                )}

                <div className="bg-[var(--surface)] rounded-2xl p-5 border border-[var(--border)]">
                    <p className="font-medium text-[var(--text)] text-base leading-relaxed">{q.question}</p>
                </div>

                <div className="space-y-2">
                    {q.options.map((opt, i) => {
                        let cls = 'border-[var(--border)] text-[var(--text)]';
                        if (selected !== null) {
                            if (i === q.answerIndex) cls = 'border-green-500 bg-green-500/10 text-green-400';
                            else if (i === selected && selected !== q.answerIndex) cls = 'border-red-500 bg-red-500/10 text-red-400';
                        }
                        return (
                            <button
                                key={i}
                                onClick={() => onAnswer(i)}
                                disabled={selected !== null}
                                className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all disabled:cursor-default ${cls} hover:border-[var(--primary)] disabled:hover:border-current`}
                            >
                                <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>
                                {opt}
                            </button>
                        );
                    })}
                </div>

                {selected !== null && (
                    <div className="space-y-3">
                        {q.explanation && (
                            <div className="text-sm bg-[var(--surface)] rounded-xl px-4 py-3 border border-[var(--border)] text-[var(--text-muted)]">
                                💡 {q.explanation}
                            </div>
                        )}
                        <button
                            onClick={onNext}
                            className="w-full py-2.5 rounded-xl bg-[var(--primary)] text-white font-medium hover:opacity-90 transition-opacity"
                        >
                            {questionIdx + 1 < questions.length ? 'Next Question →' : 'See Results'}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return null;
};

export default CourseDetail;
