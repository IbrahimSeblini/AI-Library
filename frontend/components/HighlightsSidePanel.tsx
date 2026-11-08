import React, { useEffect, useState, useCallback } from 'react';
import { Highlight, HighlightGroup } from '../types';
import {
    getHighlightGroupTitles,
    refreshHighlightGroupTitles,
    getHighlightsGrouped,
    getAllHighlightGroupTitles,
    refreshAllHighlightGroupTitles,
} from '../services/apiService';
import { LoaderIcon } from './icons/LoaderIcon';
import { RefreshIcon } from './icons/RefreshIcon';
import { XIcon } from './icons/XIcon';
import { HIGHLIGHT_COLOR_CONFIG, HIGHLIGHT_COLOR_ORDER, type HighlightColor } from '../lib/highlightColors';

interface HighlightsSidePanelProps {
    paperId: string;
    highlights: Highlight[];
    isOpen: boolean;
    onClose: () => void;
    onViewAllHighlights: () => void;
    onJumpToHighlight?: (highlight: Highlight) => void;
}

const COLOR_ORDER: HighlightColor[] = HIGHLIGHT_COLOR_ORDER;
const colorConfig = HIGHLIGHT_COLOR_CONFIG;

const MAX_PREVIEW = 3;

function groupByColor(highlights: Highlight[]): Record<HighlightColor, Highlight[]> {
    const out = Object.fromEntries(COLOR_ORDER.map((color) => [color, []])) as Record<HighlightColor, Highlight[]>;
    for (const h of highlights) {
        if (h.color in out) {
            out[h.color as HighlightColor].push(h);
        }
    }
    // Sort each bucket by created_at desc
    for (const c of COLOR_ORDER) {
        out[c].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return out;
}

interface AllReadingsGroup {
    key: string;
    paperId: number;
    paperTitle: string;
    color: HighlightColor;
    highlights: Highlight[];
    latestCreatedAt: number;
}

const titleKey = (paperId: number | string, color: string) => `${paperId}:${color}`;

function groupAcrossReadings(groups: HighlightGroup[]): AllReadingsGroup[] {
    const grouped = new Map<string, AllReadingsGroup>();
    const allHighlights = groups.flatMap((group) => group.highlights ?? []);

    for (const highlight of allHighlights) {
        if (!COLOR_ORDER.includes(highlight.color as HighlightColor)) continue;
        const color = highlight.color as HighlightColor;
        const key = titleKey(highlight.paper_id, color);
        const existing = grouped.get(key);

        if (existing) {
            existing.highlights.push(highlight);
            existing.latestCreatedAt = Math.max(
                existing.latestCreatedAt,
                new Date(highlight.created_at).getTime()
            );
            continue;
        }

        grouped.set(key, {
            key,
            paperId: highlight.paper_id,
            paperTitle: highlight.paper_title || `Paper ${highlight.paper_id}`,
            color,
            highlights: [highlight],
            latestCreatedAt: new Date(highlight.created_at).getTime(),
        });
    }

    return Array.from(grouped.values())
        .map((group) => ({
            ...group,
            highlights: group.highlights.sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            ),
        }))
        .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);
}

function bucketGroupsByColor(groups: AllReadingsGroup[]): Record<HighlightColor, AllReadingsGroup[]> {
    const out = Object.fromEntries(COLOR_ORDER.map((color) => [color, []])) as Record<HighlightColor, AllReadingsGroup[]>;
    for (const group of groups) {
        out[group.color].push(group);
    }
    return out;
}

const HighlightsSidePanel: React.FC<HighlightsSidePanelProps> = ({
    paperId,
    highlights,
    isOpen,
    onClose,
    onViewAllHighlights,
    onJumpToHighlight,
}) => {
    const [titles, setTitles] = useState<Record<string, string>>({});
    const [refreshing, setRefreshing] = useState(false);
    const [scope, setScope] = useState<'paper' | 'all'>('paper');
    const [allHighlightGroups, setAllHighlightGroups] = useState<HighlightGroup[]>([]);
    const [allTitles, setAllTitles] = useState<Record<string, string>>({});
    const [allGroupsLoading, setAllGroupsLoading] = useState(false);

    const loadTitles = useCallback(async () => {
        const rows = await getHighlightGroupTitles(paperId);
        const map: Record<string, string> = {};
        rows.forEach(r => { map[r.color] = r.title; });
        setTitles(map);
    }, [paperId]);

    useEffect(() => {
        if (!isOpen) return;
        loadTitles();
    }, [isOpen, loadTitles, highlights.length]);

    const loadAllGroups = useCallback(async () => {
        setAllGroupsLoading(true);
        try {
            const [groups, titleRows] = await Promise.all([
                getHighlightsGrouped(),
                getAllHighlightGroupTitles(),
            ]);
            setAllHighlightGroups(groups);
            const map: Record<string, string> = {};
            titleRows.forEach((row) => {
                map[titleKey(row.paper_id, row.color)] = row.title;
            });
            setAllTitles(map);
        } catch (err) {
            console.error('Failed to load all highlight groups', err);
        } finally {
            setAllGroupsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isOpen || scope !== 'all') return;
        loadAllGroups();
    }, [isOpen, scope, loadAllGroups]);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            if (scope === 'paper') {
                const rows = await refreshHighlightGroupTitles(paperId);
                const map: Record<string, string> = {};
                rows.forEach(r => { map[r.color] = r.title; });
                setTitles(map);
            } else {
                const rows = await refreshAllHighlightGroupTitles();
                const map: Record<string, string> = {};
                rows.forEach((row) => {
                    map[titleKey(row.paper_id, row.color)] = row.title;
                });
                setAllTitles(map);
                await loadAllGroups();
            }
        } catch (err) {
            console.error('Failed to refresh highlight titles', err);
        } finally {
            setRefreshing(false);
        }
    };

    const grouped = groupByColor(highlights);
    const activeColors = COLOR_ORDER.filter(c => grouped[c].length > 0);
    const groupedAcrossReadings = groupAcrossReadings(allHighlightGroups);
    const groupedAcrossReadingsByColor = bucketGroupsByColor(groupedAcrossReadings);
    const activeAllColors = COLOR_ORDER.filter(c => groupedAcrossReadingsByColor[c].length > 0);
    const canRefresh = scope === 'paper' ? activeColors.length > 0 : groupedAcrossReadings.length > 0;

    if (!isOpen) return null;

    return (
        <aside
            className="fixed right-4 top-24 bottom-4 z-40 w-[340px] max-w-[calc(100vw-2rem)]"
            aria-label="Highlights side panel"
        >
            <div className="bg-[var(--surface)] rounded-[28px] border border-[var(--border)] overflow-hidden h-full flex flex-col backdrop-blur-sm" style={{ boxShadow: 'var(--shadow-lg)' }}>
                <div className="px-5 py-4 border-b border-[var(--border)]">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[var(--text)] font-display flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                            Highlights Studio
                        </h3>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                            Switch between this paper and your whole library.
                        </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="mt-0.5 h-10 w-10 shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] transition-colors flex items-center justify-center"
                            title="Close panel"
                        >
                            <XIcon className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="mt-4 flex items-center gap-2.5">
                        <div
                            className="flex min-w-0 flex-1 rounded-[18px] border border-[var(--border)] bg-[var(--bg-secondary)]/40 p-1"
                            role="tablist"
                            aria-label="Highlights scope"
                        >
                            {([
                                ['paper', 'This Reading'],
                                ['all', 'All Readings'],
                            ] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setScope(value)}
                                    className="flex-1 rounded-[14px] px-3 py-2.5 text-sm font-semibold tracking-[0.01em] transition-colors"
                                    style={{
                                        background: scope === value ? 'rgba(255,255,255,0.08)' : 'transparent',
                                        color: scope === value ? 'var(--text)' : 'var(--text-muted)',
                                        boxShadow: scope === value ? 'inset 0 0 0 1px rgba(255,255,255,0.06)' : 'none',
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing || !canRefresh}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-[var(--border)] bg-[var(--bg-secondary)]/50 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)] disabled:opacity-50"
                            title={scope === 'paper' ? 'Refresh AI titles for this reading' : 'Refresh AI titles across all readings'}
                            aria-label={scope === 'paper' ? 'Refresh AI titles for this reading' : 'Refresh AI titles across all readings'}
                        >
                            {refreshing ? (
                                <LoaderIcon className="h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshIcon className="h-4 w-4" />
                            )}
                        </button>
                    </div>
                </div>

                <div className="p-4 space-y-5 overflow-y-auto flex-1">
                    {scope === 'all' && allGroupsLoading ? (
                        <div className="flex justify-center py-10">
                            <LoaderIcon className="w-6 h-6 animate-spin text-[var(--primary)]" />
                        </div>
                    ) : null}
                    {scope === 'paper' && activeColors.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] text-center py-4">
                            No highlights yet in this reading. Select text in the document to highlight it.
                        </p>
                    ) : null}
                    {scope === 'all' && !allGroupsLoading && groupedAcrossReadings.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] text-center py-4">
                            No highlights yet across your readings.
                        </p>
                    ) : null}
                    {scope === 'paper' ? (
                        activeColors.map(color => {
                            const cfg = colorConfig[color];
                            const items = grouped[color].slice(0, MAX_PREVIEW);
                            const total = grouped[color].length;
                            const title = titles[color];
                            return (
                                <div key={color}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`w-3 h-3 rounded-sm ${cfg.dot}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-semibold text-[var(--text)] truncate">
                                                {title || `— untitled ${cfg.name.toLowerCase()} —`}
                                            </div>
                                            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
                                                {total} {cfg.name.toLowerCase()} highlight{total !== 1 ? 's' : ''} in this reading
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        {items.map(h => (
                                            <button
                                                key={h.id}
                                                onClick={() => {
                                                    if (h.paper_id === Number(paperId)) {
                                                        onJumpToHighlight?.(h);
                                                        return;
                                                    }
                                                    onViewAllHighlights();
                                                }}
                                                className={`w-full text-left text-xs leading-snug rounded-md border-l-2 ${cfg.border} bg-[var(--bg-secondary)]/60 px-2 py-1.5 hover:bg-[var(--bg-secondary)] transition-colors`}
                                                title="Jump to highlight in document"
                                            >
                                                <span className="line-clamp-3 text-[var(--text)]">
                                                    {h.highlighted_text}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                    {total > MAX_PREVIEW && (
                                        <button
                                            type="button"
                                            onClick={onViewAllHighlights}
                                            className="mt-2 text-xs font-semibold text-[var(--primary)] hover:opacity-80 transition-opacity"
                                        >
                                            View more
                                        </button>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <>
                            {activeAllColors.map((color) => {
                                const cfg = colorConfig[color];
                                const groupsForColor = groupedAcrossReadingsByColor[color];
                                const previewGroups = groupsForColor.slice(0, MAX_PREVIEW);
                                return (
                                    <div key={color}>
                                        <div className="mb-2 flex items-center gap-2">
                                            <span className={`h-3 w-3 rounded-sm ${cfg.dot}`} />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-xs font-semibold text-[var(--text)]">
                                                    {cfg.name} Highlights
                                                </div>
                                                <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                                                    {groupsForColor.length} grouped title{groupsForColor.length !== 1 ? 's' : ''} across all readings
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            {previewGroups.map((group) => {
                                                const title = allTitles[group.key] || `${cfg.name} highlights`;
                                                const latestHighlight = group.highlights[0];
                                                return (
                                                    <button
                                                        key={group.key}
                                                        type="button"
                                                        onClick={onViewAllHighlights}
                                                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/45 p-3 text-left transition-colors hover:bg-[var(--bg-secondary)]"
                                                        title="Open My Highlights to see this group"
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            <span className={`mt-1 h-3 w-3 shrink-0 rounded-sm ${cfg.dot}`} />
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-xs font-semibold text-[var(--text)] truncate">
                                                                    {title}
                                                                </div>
                                                                <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                                                                    {group.paperTitle} · {group.highlights.length} highlight{group.highlights.length !== 1 ? 's' : ''}
                                                                </div>
                                                                <p className="mt-2 line-clamp-3 text-xs leading-snug text-[var(--text)]">
                                                                    {latestHighlight?.highlighted_text}
                                                                </p>
                                                                {group.highlights.length > 1 ? (
                                                                    <div className="mt-2 text-[11px] font-semibold text-[var(--primary)]">
                                                                        +{group.highlights.length - 1} more in this group
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {groupsForColor.length > MAX_PREVIEW ? (
                                            <button
                                                type="button"
                                                onClick={onViewAllHighlights}
                                                className="mt-2 text-xs font-semibold text-[var(--primary)] hover:opacity-80 transition-opacity"
                                            >
                                                View more
                                            </button>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>
        </aside>
    );
};

export default HighlightsSidePanel;
