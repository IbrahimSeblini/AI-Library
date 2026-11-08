import React, { useState, useEffect, useCallback } from 'react';
import { User, WeeklySummary, StudySession, ReadingSpeed } from '../types';
import { getWeeklySummary, getSessionHistory, getReadingSpeed } from '../services/apiService';
import { LoaderIcon } from './icons/LoaderIcon';

interface StudyTrackerProps {
    user: User;
}

const ACTIVITY_COLORS: Record<string, string> = {
    reading: 'bg-emerald-500',
    chatbot: 'bg-violet-500',
    groups: 'bg-amber-500',
    plagiarism: 'bg-rose-500',
    home: 'bg-sky-500',
};

const ACTIVITY_LABELS: Record<string, string> = {
    reading: 'Reading',
    chatbot: 'Chatbot',
    groups: 'Group Work',
    plagiarism: 'Writings',
    home: 'Home / Browse',
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Shared section header (same pattern as Home) ───────────────────────────────
const SectionHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
    <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-[var(--text)] tracking-[-0.01em]">{title}</h2>
        {action}
    </div>
);

// ── Compact horizontal bar ─────────────────────────────────────────────────────
const BarRow: React.FC<{ label: string; formatted: string; pct: number; colorClass: string }> = ({ label, formatted, pct, colorClass }) => (
    <div className="flex items-center gap-3">
        <span className="text-sm text-[var(--text)] w-32 flex-shrink-0 truncate">{label}</span>
        <div className="flex-1 h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
            <div className={`${colorClass} h-full rounded-full transition-all duration-500`} style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
        <span className="text-xs text-[var(--text-muted)] font-mono w-12 text-right flex-shrink-0">{formatted}</span>
    </div>
);

// ── Daily bar chart ────────────────────────────────────────────────────────────
const DailyChart: React.FC<{ daily: { date: string; totalSeconds: number; formatted: string }[] }> = ({ daily }) => {
    const maxSecs = Math.max(...daily.map(d => d.totalSeconds), 1);
    return (
        <div className="flex items-end gap-2 h-28">
            {daily.map((d, i) => {
                const heightPct = maxSecs > 0 ? Math.max((d.totalSeconds / maxSecs) * 100, 3) : 3;
                const isToday = d.date === new Date().toISOString().split('T')[0];
                return (
                    <div key={d.date} className="flex flex-col items-center flex-1 h-full justify-end group">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[var(--text-muted)] mb-1 whitespace-nowrap font-mono">
                            {d.formatted || '0s'}
                        </div>
                        <div
                            className={`w-full rounded-t transition-all duration-500 ${isToday ? 'bg-[var(--primary)]' : 'bg-[var(--primary)]/30'}`}
                            style={{ height: `${heightPct}%`, minHeight: '3px' }}
                        />
                        <span className={`text-[10px] mt-1.5 ${isToday ? 'text-[var(--primary)] font-semibold' : 'text-[var(--text-muted)]'}`}>
                            {DAY_NAMES[i]}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

const WEEKLY_GOAL_KEY = 'mylibrary_weekly_goal_hours';
function loadWeeklyGoal(): number | null {
    try { const v = localStorage.getItem(WEEKLY_GOAL_KEY); if (!v) return null; const n = Number(v); return n > 0 && n < 1000 ? n : null; } catch { return null; }
}
function saveWeeklyGoal(hours: number | null) {
    if (hours == null) localStorage.removeItem(WEEKLY_GOAL_KEY);
    else localStorage.setItem(WEEKLY_GOAL_KEY, String(hours));
}
function computeStreak(sessions: StudySession[]): number {
    if (!sessions.length) return 0;
    const days = new Set<string>();
    sessions.forEach(s => days.add(s.startedAt.slice(0, 10)));
    const today = new Date().toISOString().slice(0, 10);
    if (!days.has(today)) return 0;
    let streak = 0;
    const d = new Date(today);
    while (true) { const key = d.toISOString().slice(0, 10); if (!days.has(key)) break; streak++; d.setDate(d.getDate() - 1); }
    return streak;
}

const StudyTracker: React.FC<StudyTrackerProps> = ({ user }) => {
    const [summary, setSummary] = useState<WeeklySummary | null>(null);
    const [history, setHistory] = useState<StudySession[]>([]);
    const [readingSpeed, setReadingSpeed] = useState<ReadingSpeed | null>(null);
    const [weekOffset, setWeekOffset] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [tab, setTab] = useState<'overview' | 'history'>('overview');
    const [weeklyGoalHours, setWeeklyGoalHours] = useState<number | null>(() => loadWeeklyGoal());

    // Sync goal when changed from Settings
    useEffect(() => {
        const handler = () => setWeeklyGoalHours(loadWeeklyGoal());
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);

    const fetchData = useCallback(async (showLoader = true) => {
        if (showLoader) setIsLoading(true);
        try {
            const [weekData, histData, speedData] = await Promise.all([
                getWeeklySummary(user.id, weekOffset),
                getSessionHistory(user.id),
                getReadingSpeed(),
            ]);
            setSummary(weekData);
            setHistory(histData);
            setReadingSpeed(speedData);
        } catch (err) {
            console.error('Failed to load tracker data', err);
        } finally {
            setIsLoading(false);
        }
    }, [user.id, weekOffset]);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { const t = setInterval(() => fetchData(false), 60_000); return () => clearInterval(t); }, [fetchData]);
    useEffect(() => {
        const onVisible = () => { if (document.visibilityState === 'visible') fetchData(false); };
        const onRefresh = () => fetchData(false);
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('study-tracker-refresh', onRefresh);
        return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('study-tracker-refresh', onRefresh); };
    }, [fetchData]);

    const streak = computeStreak(history);

    return (
        <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-10">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="mb-8">
                <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display">Study Tracker</h1>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                    <p className="text-sm text-[var(--text-muted)]">Track how much time you spend on each activity.</p>
                    {readingSpeed && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
                            <span className="font-semibold text-[var(--text)]">{Math.round(readingSpeed.wordsPerMinute)} WPM</span>
                            reading speed
                            {readingSpeed.sampleSize > 0 && <span className="opacity-60">· {readingSpeed.sampleSize} sessions</span>}
                        </span>
                    )}
                    {streak > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600 dark:border-orange-800/40 dark:bg-orange-900/20 dark:text-orange-400">
                            <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5 0.67z"/></svg>
                            {streak} day streak
                        </span>
                    )}
                </div>
            </div>

            {/* ── Tabs ────────────────────────────────────────────────────── */}
            <div className="flex gap-1 mb-8 border-b border-[var(--border)]">
                {(['overview', 'history'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                            tab === t
                                ? 'border-[var(--primary)] text-[var(--primary)]'
                                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                        }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center h-40">
                    <LoaderIcon className="w-8 h-8 animate-spin text-[var(--primary)]" />
                </div>
            ) : (
                <>
                    {tab === 'overview' && summary && (
                        <div className="space-y-10">

                            {/* Week nav + total */}
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setWeekOffset(prev => prev + 1)}
                                    className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                                >
                                    ← Prev
                                </button>
                                <div className="flex-1 text-center">
                                    <p className="text-xs text-[var(--text-muted)]">{summary.weekStart} — {summary.weekEnd}</p>
                                    <p className="text-2xl font-bold text-[var(--text)] mt-0.5">{summary.totalFormatted}</p>
                                </div>
                                <button
                                    onClick={() => setWeekOffset(prev => Math.max(0, prev - 1))}
                                    disabled={weekOffset === 0}
                                    className={`text-sm transition-colors ${weekOffset === 0 ? 'text-[var(--border)] cursor-not-allowed' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
                                >
                                    Next →
                                </button>
                            </div>

                            {/* Weekly goal progress */}
                            {weekOffset === 0 && weeklyGoalHours != null && (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                                        <span>{summary.totalFormatted} of {weeklyGoalHours}h goal</span>
                                        <span>{Math.min(100, Math.round((summary.totalSeconds / (weeklyGoalHours * 3600)) * 100))}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (summary.totalSeconds / (weeklyGoalHours * 3600)) * 100)}%`, background: 'var(--gradient-primary)' }} />
                                    </div>
                                </div>
                            )}

                            {/* Daily chart */}
                            <section>
                                <SectionHeader
                                    title="Daily Breakdown"
                                    action={
                                        <button
                                            onClick={() => {
                                                if (!summary) return;
                                                const lines = [`Study Summary: ${summary.weekStart} — ${summary.weekEnd}`, '', `Total: ${summary.totalFormatted}`, '', 'By activity:', ...summary.byActivity.map(a => `  ${ACTIVITY_LABELS[a.activityType] || a.activityType}: ${a.formatted}`), '', 'Daily:', ...summary.daily.map(d => `  ${d.date}: ${d.formatted}`)];
                                                const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a'); a.href = url; a.download = `study-summary-${summary.weekStart}.txt`; a.click();
                                                URL.revokeObjectURL(url);
                                            }}
                                            className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                                        >
                                            Download →
                                        </button>
                                    }
                                />
                                {summary.daily.every(d => d.totalSeconds === 0) ? (
                                    <p className="text-sm text-[var(--text-muted)] py-6 text-center">No data this week yet — start using the app and it'll appear here.</p>
                                ) : (
                                    <DailyChart daily={summary.daily} />
                                )}
                            </section>

                            {/* Activity + Subject — two columns */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                <section>
                                    <SectionHeader title="Time by Activity" />
                                    {summary.byActivity.length === 0 ? (
                                        <p className="text-sm text-[var(--text-muted)]">No data yet.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {summary.byActivity.map(a => {
                                                const pct = summary.totalSeconds > 0 ? (a.totalSeconds / summary.totalSeconds) * 100 : 0;
                                                return (
                                                    <BarRow
                                                        key={a.activityType}
                                                        label={ACTIVITY_LABELS[a.activityType] || a.activityType}
                                                        formatted={a.formatted}
                                                        pct={pct}
                                                        colorClass={ACTIVITY_COLORS[a.activityType] || 'bg-slate-400'}
                                                    />
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>

                                <section>
                                    <SectionHeader title="Reading by Subject" />
                                    {summary.byCategory.length === 0 ? (
                                        <p className="text-sm text-[var(--text-muted)]">No reading data yet.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {summary.byCategory.map((c, i) => {
                                                const readingTotal = summary.byActivity.find(a => a.activityType === 'reading')?.totalSeconds || 1;
                                                const pct = (c.totalSeconds / readingTotal) * 100;
                                                const colors = ['bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-green-500', 'bg-lime-500', 'bg-emerald-400'];
                                                return (
                                                    <BarRow
                                                        key={c.category}
                                                        label={c.category}
                                                        formatted={c.formatted}
                                                        pct={pct}
                                                        colorClass={colors[i % colors.length]}
                                                    />
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            </div>
                        </div>
                    )}

                    {tab === 'history' && (
                        <section>
                            <SectionHeader title="Recent Sessions" />
                            {history.length === 0 ? (
                                <p className="text-sm text-[var(--text-muted)] text-center py-12">No session history yet.</p>
                            ) : (
                                <div className="space-y-1">
                                    {history.map(s => (
                                        <div key={s.id} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-[var(--surface)] transition-colors">
                                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ACTIVITY_COLORS[s.activityType] || 'bg-slate-400'}`} />
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-medium text-[var(--text)]">{ACTIVITY_LABELS[s.activityType] || s.activityType}</span>
                                                {s.category && <span className="text-xs text-[var(--primary)] ml-2">({s.category})</span>}
                                                <p className="text-xs text-[var(--text-muted)] mt-0.5">{new Date(s.startedAt).toLocaleString()}</p>
                                            </div>
                                            <span className="text-sm font-semibold text-[var(--text)] font-mono flex-shrink-0">
                                                {s.durationSecs ? formatDuration(s.durationSecs) : '—'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}
                </>
            )}

        </div>
    );
};

function formatDuration(secs: number): string {
    if (secs < 60) return `${Math.round(secs)}s`;
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours > 0) return `${hours}h ${remMins}m`;
    return `${remMins}m`;
}

export default StudyTracker;
