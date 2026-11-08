import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Node } from 'reactflow';
import { ConceptNodeData } from './ConceptNode';
import { MasteryEvidence, MasteryState, RoadmapEdge } from '../../types';
import { explainConcept, getRoadmapMasteryEvidence } from '../../services/apiService';
import AiTrustFooter from '../ui/AiTrustFooter';

interface Props {
    node: Node<ConceptNodeData> | null;
    allNodes: Node<ConceptNodeData>[];
    edges: RoadmapEdge[];
    onClose: () => void;
    onNavigateToPaper: (paperId: string) => void;
    onNavigateToSummary: (text: string) => void;
    onFlyToNode: (nodeId: string) => void;
    onAskLibrarian?: (prompt: string) => void;
}

const MASTERY_CONFIG: Record<
    MasteryState,
    { label: string; color: string; bg: string; desc: string; dots: number }
> = {
    1: {
        label: 'Discovered',
        color: '#94a3b8',
        bg: 'rgba(148,163,184,0.12)',
        desc: 'In your library but not yet explored deeply.',
        dots: 1,
    },
    2: {
        label: 'Reading',
        color: 'var(--primary)',
        bg: 'var(--primary-light)',
        desc: 'You have opened a paper containing this concept.',
        dots: 2,
    },
    3: {
        label: 'Engaged',
        color: 'var(--primary)',
        bg: 'var(--primary-light)',
        desc: 'You have highlighted text related to this concept.',
        dots: 3,
    },
    4: {
        label: 'Mastered',
        color: 'var(--warning)',
        bg: 'var(--warning-light)',
        desc: 'Deep engagement — multiple highlights across related papers.',
        dots: 4,
    },
};

const TYPE_ICONS: Record<string, string> = {
    theory: 'T',
    method: 'M',
    tool: 'To',
    dataset: 'D',
    person: 'P',
    field: 'F',
};

// ── Research Links ─────────────────────────────────────────────────────────────

const RESEARCH_LINKS = [
    {
        label: 'Wikipedia',
        description: 'Encyclopedia overview',
        icon: (
            <span style={{ fontWeight: 900, fontSize: 14, color: 'var(--primary)' }}>W</span>
        ),
        url: (name: string) => `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`,
    },
    {
        label: 'Google Scholar',
        description: 'Academic papers',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
        ),
        url: (name: string) => `https://scholar.google.com/scholar?q=${encodeURIComponent(name)}`,
    },
    {
        label: 'ArXiv',
        description: 'Preprint research',
        icon: (
            <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--primary)', letterSpacing: '-0.5px' }}>ar</span>
        ),
        url: (name: string) => `https://arxiv.org/search/?searchtype=all&query=${encodeURIComponent(name)}`,
    },
    {
        label: 'Papers With Code',
        description: 'Code implementations',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
            </svg>
        ),
        url: (name: string) => `https://paperswithcode.com/search?q_meta=&q_type=&q=${encodeURIComponent(name)}`,
    },
];

const ResearchLinks: React.FC<{ conceptName: string; subject: string }> = ({ conceptName, subject }) => {
    const [explanation, setExplanation] = useState<string | null>(null);
    const [loadingExplain, setLoadingExplain] = useState(false);
    const [explainError, setExplainError] = useState<string | null>(null);

    const handleExplain = async () => {
        setLoadingExplain(true);
        setExplainError(null);
        try {
            const res = await explainConcept(conceptName, subject);
            setExplanation(res.explanation);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const isQuota =
                msg.includes('429') ||
                msg.toLowerCase().includes('quota') ||
                msg.toLowerCase().includes('rate limit');
            if (isQuota) {
                setExplainError('AI quota exceeded. Try again tomorrow or search the links above.');
            } else {
                setExplainError('Could not load explanation. Try again.');
            }
        } finally {
            setLoadingExplain(false);
        }
    };

    return (
        <div>
            <h3
                className="text-xs font-semibold uppercase tracking-widest mb-2.5"
                style={{ color: 'var(--text-subtle)' }}
            >
                Research &amp; Learn More
            </h3>

            {/* Research links */}
            <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border)' }}
            >
                {RESEARCH_LINKS.map((link, idx) => (
                    <a
                        key={link.label}
                        href={link.url(conceptName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2.5 transition-colors group"
                        style={{
                            borderTop: idx > 0 ? '1px solid var(--border)' : undefined,
                            background: 'var(--surface)',
                            textDecoration: 'none',
                        }}
                        onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.background = 'var(--primary-light)';
                        }}
                        onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.background = 'var(--surface)';
                        }}
                    >
                        {/* Icon */}
                        <div
                            className="flex items-center justify-center flex-shrink-0"
                            style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                background: 'var(--primary-light)',
                            }}
                        >
                            {link.icon}
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                                {link.label}
                            </p>
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                {link.description}
                            </p>
                        </div>

                        {/* Arrow */}
                        <span
                            className="text-xs flex-shrink-0 transition-transform group-hover:translate-x-0.5"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            →
                        </span>
                    </a>
                ))}
            </div>

            {/* Explain concept */}
            <div className="mt-3">
                {!explanation && !loadingExplain && (
                    <button
                        onClick={handleExplain}
                        className="w-full text-xs font-medium py-2 rounded-xl transition-colors"
                        style={{
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border)',
                        }}
                        onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.color = 'var(--text)';
                        }}
                        onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                        }}
                    >
                        Explain this concept
                    </button>
                )}

                {loadingExplain && (
                    <div className="space-y-2 px-1">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="h-3 rounded animate-pulse"
                                style={{
                                    background: 'var(--border)',
                                    width: i === 3 ? '60%' : '100%',
                                }}
                            />
                        ))}
                    </div>
                )}

                {explanation && (
                    <div
                        className="rounded-xl p-3"
                        style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)' }}
                    >
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text)' }}>
                            {explanation}
                        </p>
                        <AiTrustFooter
                            feature="roadmap"
                            contextId={`concept:${conceptName}`}
                            source={`Based on the roadmap concept and ${subject || 'library'} context`}
                            onRegenerate={() => { setExplanation(null); void handleExplain(); }}
                            regenerateLabel="Refresh"
                            metadata={{ concept_name: conceptName, subject }}
                            compact
                        />
                    </div>
                )}

                {explainError && (
                    <p className="text-xs mt-2 px-3 py-2 rounded-lg"
                       style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', border: '1px solid rgba(245,158,11,0.3)' }}>
                        {explainError}
                    </p>
                )}
            </div>
        </div>
    );
};

// ── NodeSidePanel ──────────────────────────────────────────────────────────────

const NodeSidePanel: React.FC<Props> = ({
    node,
    allNodes,
    edges,
    onClose,
    onNavigateToPaper,
    onNavigateToSummary,
    onFlyToNode,
    onAskLibrarian,
}) => {
    const [evidenceByPaper, setEvidenceByPaper] = useState<Record<string, MasteryEvidence>>({});
    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const data = node?.data ?? null;

    // Find related nodes via edges
    const relatedNodeIds = new Set<string>();
    if (node) {
        edges.forEach((e) => {
            if (e.source === node.id) relatedNodeIds.add(e.target);
            if (e.target === node.id) relatedNodeIds.add(e.source);
        });
    }
    const relatedNodes = allNodes.filter((n) => relatedNodeIds.has(n.id));

    const mastery = (data?.mastery_state ?? 1) as MasteryState;
    const mc = MASTERY_CONFIG[mastery];

    const paperEntries = Object.entries(data?.paper_titles ?? {}).slice(0, 6);
    const firstPaperId = paperEntries[0]?.[0];
    const allPaperEntries = Object.entries(data?.paper_titles ?? {});
    const evidence = allPaperEntries
        .map(([pid]) => evidenceByPaper[pid])
        .filter(Boolean);
    const viewedCount = evidence.filter((item) => item.viewed).length;
    const highlightCount = evidence.reduce((sum, item) => sum + item.highlight_count, 0);
    const quizCorrectCount = evidence.reduce((sum, item) => sum + item.quiz_correct_count, 0);
    const masteredCount = evidence.filter((item) => item.is_mastered).length;
    const nextStep =
        mastery >= 4
            ? 'Keep it fresh by revisiting related papers when new work is added.'
            : mastery >= 3
                ? 'Take or continue a quiz on a related paper to reach mastery.'
                : mastery >= 2
                    ? 'Highlight an important passage or attempt a quiz to mark real engagement.'
                    : 'Open one related paper to begin reading progress.';

    useEffect(() => {
        const ids = Object.keys(data?.paper_titles ?? {});
        if (!ids.length) {
            setEvidenceByPaper({});
            return;
        }
        let cancelled = false;
        getRoadmapMasteryEvidence(ids)
            .then((result) => {
                if (!cancelled) setEvidenceByPaper(result);
            })
            .catch(() => {
                if (!cancelled) setEvidenceByPaper({});
            });
        return () => { cancelled = true; };
    }, [data?.id, data?.paper_titles]);

    return (
        <AnimatePresence>
            {node && data && (
                <>
                    {/* Backdrop (only on mobile) */}
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-30 md:hidden"
                        style={{ background: 'rgba(0,0,0,0.4)' }}
                        onClick={onClose}
                    />

                    {/* Panel */}
                    <motion.div
                        key="panel"
                        initial={{ x: 380, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 380, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                        className="fixed right-0 top-16 bottom-0 z-40 flex flex-col overflow-hidden"
                        style={{
                            width: 360,
                            background: 'var(--surface)',
                            borderLeft: '1px solid var(--border)',
                            boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
                        }}
                    >
                        {/* Header */}
                        <div
                            className="flex items-start justify-between p-5 pb-4"
                            style={{ borderBottom: '1px solid var(--border-subtle)' }}
                        >
                            <div className="flex-1 min-w-0 pr-3">
                                {/* Type badge */}
                                <div className="flex items-center gap-2 mb-2">
                                    <span
                                        className="text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
                                        style={{
                                            background: 'var(--primary-light)',
                                            color: 'var(--primary)',
                                        }}
                                    >
                                        {data.type}
                                    </span>
                                </div>
                                {/* Name */}
                                <h2
                                    className="text-lg font-bold leading-tight"
                                    style={{ color: 'var(--text)' }}
                                >
                                    {data.name}
                                </h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                                style={{
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Scrollable body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            {/* Description */}
                            {data.description && (
                                <p
                                    className="text-sm leading-relaxed"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    {data.description}
                                </p>
                            )}

                            {/* Mastery state */}
                            <div className="space-y-3 border-y border-[var(--border)]/70 py-4">
                                <div className="flex items-center justify-between">
                                    <span
                                        className="text-sm font-semibold"
                                        style={{ color: mc.color }}
                                    >
                                        {mc.label}
                                    </span>
                                    {/* Progress dots */}
                                    <div className="flex gap-1.5">
                                        {[1, 2, 3, 4].map((dot) => (
                                            <div
                                                key={dot}
                                                style={{
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: '50%',
                                                    background:
                                                        dot <= mastery ? mc.color : 'rgba(148,163,184,0.3)',
                                                    transition: 'background 0.3s ease',
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {mc.desc}
                                </p>
                                <div className="space-y-1.5 text-xs text-[var(--text-muted)]">
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Found in related papers</span>
                                        <strong className="text-[var(--text)]">{allPaperEntries.length}</strong>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Papers opened</span>
                                        <strong className="text-[var(--text)]">{viewedCount}</strong>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Highlights saved</span>
                                        <strong className="text-[var(--text)]">{highlightCount}</strong>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Correct quiz answers</span>
                                        <strong className="text-[var(--text)]">{quizCorrectCount}</strong>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Mastered papers</span>
                                        <strong className="text-[var(--text)]">{masteredCount}</strong>
                                    </div>
                                </div>
                                <p className="text-xs font-medium text-[var(--primary)]">{nextStep}</p>
                            </div>

                            {/* Found in papers */}
                            <div>
                                <h3
                                    className="text-xs font-semibold uppercase tracking-widest mb-2.5"
                                    style={{ color: 'var(--text-subtle)' }}
                                >
                                    Found in {paperEntries.length} paper
                                    {paperEntries.length !== 1 ? 's' : ''}
                                </h3>
                                <div className="space-y-1.5">
                                    {paperEntries.map(([pid, title]) => (
                                        <button
                                            key={pid}
                                            onClick={() => onNavigateToPaper(pid)}
                                            className="w-full text-left text-xs px-3 py-2 rounded-lg flex items-start gap-2 transition-colors"
                                            style={{
                                                background: 'var(--bg-secondary)',
                                                color: 'var(--text)',
                                            }}
                                            onMouseEnter={(e) => {
                                                (e.currentTarget as HTMLButtonElement).style.background =
                                                    'var(--primary-light)';
                                                (e.currentTarget as HTMLButtonElement).style.color =
                                                    'var(--primary)';
                                            }}
                                            onMouseLeave={(e) => {
                                                (e.currentTarget as HTMLButtonElement).style.background =
                                                    'var(--bg-secondary)';
                                                (e.currentTarget as HTMLButtonElement).style.color =
                                                    'var(--text)';
                                            }}
                                        >
                                            <span className="leading-snug">{title || `Paper #${pid}`}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Related concepts */}
                            {relatedNodes.length > 0 && (
                                <div>
                                    <h3
                                        className="text-xs font-semibold uppercase tracking-widest mb-2.5"
                                        style={{ color: 'var(--text-subtle)' }}
                                    >
                                        Related concepts
                                    </h3>
                                    <div className="flex flex-wrap gap-1.5">
                                        {relatedNodes.map((n) => (
                                            <button
                                                key={n.id}
                                                onClick={() => onFlyToNode(n.id)}
                                                className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors"
                                                style={{
                                                    background: 'var(--bg-secondary)',
                                                    color: 'var(--text-muted)',
                                                    border: '1px solid var(--border)',
                                                }}
                                                onMouseEnter={(e) => {
                                                    (e.currentTarget as HTMLButtonElement).style.background =
                                                        'var(--primary-light)';
                                                    (e.currentTarget as HTMLButtonElement).style.color =
                                                        'var(--primary)';
                                                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                                                        'var(--primary)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    (e.currentTarget as HTMLButtonElement).style.background =
                                                        'var(--bg-secondary)';
                                                    (e.currentTarget as HTMLButtonElement).style.color =
                                                        'var(--text-muted)';
                                                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                                                        'var(--border)';
                                                }}
                                            >
                                                {n.data.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Research links + Explain concept */}
                            <ResearchLinks
                                conceptName={data.name}
                                subject={data.subject_cluster}
                            />
                        </div>

                        {/* Action buttons — pinned at bottom */}
                        <div
                            className="p-4 space-y-2"
                            style={{ borderTop: '1px solid var(--border-subtle)' }}
                        >
                            {firstPaperId && (
                                <button
                                    onClick={() => onNavigateToPaper(firstPaperId)}
                                    className="w-full text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all"
                                    style={{
                                        background: 'var(--gradient-primary)',
                                        color: '#fff',
                                        boxShadow: 'var(--glow-primary)',
                                    }}
                                >
                                    Open Paper →
                                </button>
                            )}
                            {firstPaperId && data.paper_titles[firstPaperId] && (
                                <button
                                    onClick={() =>
                                        onNavigateToSummary(data.paper_titles[firstPaperId] ?? data.name)
                                    }
                                    className="w-full text-sm font-medium py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all"
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-muted)',
                                        border: '1px solid var(--border)',
                                    }}
                                    onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
                                        (e.currentTarget as HTMLButtonElement).style.borderColor =
                                            'var(--primary)';
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLButtonElement).style.color =
                                            'var(--text-muted)';
                                        (e.currentTarget as HTMLButtonElement).style.borderColor =
                                            'var(--border)';
                                    }}
                                >
                                    Generate Summary
                                </button>
                            )}
                            {onAskLibrarian && (
                                <button
                                    onClick={() => onAskLibrarian(`Answer from my library: explain the roadmap concept "${data.name}" in ${data.subject_cluster || 'this subject'}, why it matters, and which saved papers I should read first.`)}
                                    className="w-full text-sm font-medium py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all"
                                    style={{
                                        background: 'var(--surface)',
                                        color: 'var(--primary)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    Ask Librarian
                                </button>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default NodeSidePanel;
