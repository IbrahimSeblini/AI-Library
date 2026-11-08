import React, {
    useState,
    useEffect,
    useCallback,
    useRef,
    useMemo,
} from 'react';
import ReactFlow, {
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    Background,
    BackgroundVariant,
    Controls,
    ReactFlowProvider,
    useReactFlow,
    useOnViewportChange,
    Panel,
    NodeTypes,
    EdgeTypes,
    Viewport,
} from 'reactflow';
import 'reactflow/dist/style.css';
import Dagre from '@dagrejs/dagre';
import { motion, AnimatePresence } from 'framer-motion';

import { RoadmapData, RoadmapNode, RoadmapEdge, MasteryState, StudyPlan, StudyPlanDay, StudyPlanTask } from '../../types';
import { getRoadmap, generateRoadmap, getRoadmapStatus, getMasteryUpdate, generateStudyPlan, getActiveStudyPlan, updateStudyPlanTask, recomputeStudyPlan, startStudySession, endStudySession, getCourses, getLibraryPaperCount } from '../../services/apiService';
import ConceptNode, { ConceptNodeData } from './ConceptNode';
import ConceptEdge from './ConceptEdge';
import NodeSidePanel from './NodeSidePanel';
import PaperNode, { PaperNodeData, PAPER_NODE_WIDTH, PAPER_NODE_HEIGHT } from './PaperNode';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
    onNavigateToPaper: (paperId: string) => void;
    onNavigateToSummary: (text: string) => void;
    onAskLibrarian?: (prompt: string) => void;
    initialCourseId?: number;  // pre-select a course when navigating from CourseDetail
}

type Status = 'idle' | 'loading' | 'generating' | 'ready' | 'error' | 'empty';
type ViewMode = 'papers' | 'concepts' | 'list';

// ── Dagre Layout ──────────────────────────────────────────────────────────────

const NODE_TYPES: NodeTypes = { concept: ConceptNode, paper: PaperNode };
const EDGE_TYPES: EdgeTypes = { concept: ConceptEdge };

function getSize(importance: number): number {
    const sizes: Record<number, number> = { 1: 44, 2: 52, 3: 60, 4: 68, 5: 76 };
    return sizes[Math.min(5, Math.max(1, importance))] ?? 60;
}

function getLayoutedElements(
    apiNodes: RoadmapNode[],
    apiEdges: RoadmapEdge[],
    activeSubject: string | null,
    coursePaperIds?: Set<number>
): { rfNodes: Node<ConceptNodeData>[]; rfEdges: Edge[] } {
    // Returns a mutable result so callers can add properties like `upgrading`
    if (apiNodes.length === 0) return { rfNodes: [], rfEdges: [] };

    // ── Dagre layout (TB, no multigraph) ─────────────────────────────────────
    const g = new Dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
        rankdir: 'TB',
        nodesep: 80,
        ranksep: 100,
        marginx: 40,
        marginy: 40,
    });

    const nodeIds = new Set(apiNodes.map((n) => n.id));

    apiNodes.forEach((n) => {
        const s = getSize(n.importance);
        g.setNode(n.id, { width: s, height: s });
    });

    // Only add edges where both endpoints exist — avoids phantom nodes in dagre
    apiEdges.forEach((e) => {
        if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
            g.setEdge(e.source, e.target);
        }
    });

    Dagre.layout(g);

    // ── Build React Flow nodes ────────────────────────────────────────────────
    const rfNodes: Node<ConceptNodeData>[] = apiNodes.map((n, idx) => {
        const pos = g.node(n.id);
        const s = getSize(n.importance);
        const filtered = (activeSubject ? n.subject_cluster !== activeSubject : false)
            || (coursePaperIds ? !n.paper_ids.some((pid) => coursePaperIds.has(pid)) : false);

        return {
            id: n.id,
            type: 'concept',
            position: {
                x: (pos?.x ?? idx * 120) - s / 2,
                y: (pos?.y ?? idx * 120) - s / 2,
            },
            data: {
                name: n.name,
                type: n.type,
                description: n.description,
                importance: n.importance,
                mastery_state: n.mastery_state,
                paper_ids: n.paper_ids,
                paper_titles: n.paper_titles,
                subject_cluster: n.subject_cluster,
                filtered,
                animIndex: idx,
            },
            selectable: true,
            draggable: true,
        };
    });

    // ── Build React Flow edges ────────────────────────────────────────────────
    const nodeMap = new Map(rfNodes.map((n) => [n.id, n.data]));
    const rfEdges: Edge[] = apiEdges
        .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map((e) => {
            const srcState = nodeMap.get(e.source)?.mastery_state ?? 1;
            const tgtState = nodeMap.get(e.target)?.mastery_state ?? 1;
            const mastered = srcState === 4 || tgtState === 4;
            const srcFiltered = nodeMap.get(e.source)?.filtered ?? false;
            const tgtFiltered = nodeMap.get(e.target)?.filtered ?? false;
            const filtered = srcFiltered || tgtFiltered;

            return {
                id: e.id,
                source: e.source,
                target: e.target,
                type: 'concept',
                data: { label: e.label, mastered, filtered },
                animated: mastered,
            };
        });

    return { rfNodes, rfEdges };
}

// ── Paper-first layout helpers ────────────────────────────────────────────────

interface PaperGroup {
    paper_id: number;
    title: string;
    concepts: RoadmapNode[];
    mastery_state: MasteryState;
}

function buildPaperGroups(apiNodes: RoadmapNode[]): Map<number, PaperGroup> {
    const map = new Map<number, PaperGroup>();
    for (const node of apiNodes) {
        for (const pid of node.paper_ids) {
            if (pid == null) continue;
            const title = node.paper_titles[String(pid)] ?? `Paper #${pid}`;
            if (!map.has(pid)) {
                map.set(pid, { paper_id: pid, title, concepts: [], mastery_state: 4 as MasteryState });
            }
            const pg = map.get(pid)!;
            if (!pg.concepts.some((concept) => concept.id === node.id)) {
                pg.concepts.push(node);
            }
            if (node.mastery_state < pg.mastery_state) {
                pg.mastery_state = node.mastery_state as MasteryState;
            }
        }
    }
    return map;
}

function buildPaperPaperEdges(
    apiNodes: RoadmapNode[],
    apiEdges: RoadmapEdge[],
): Array<{ source: string; target: string }> {
    const seen = new Set<string>();
    const result: Array<{ source: string; target: string }> = [];

    const addEdge = (a: number, b: number) => {
        if (a === b) return;
        const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push({ source: `paper-${a}`, target: `paper-${b}` });
        }
    };

    // 1. Concepts that belong to multiple papers directly link those papers
    for (const node of apiNodes) {
        const pids = node.paper_ids;
        for (let i = 0; i < pids.length - 1; i++) {
            for (let j = i + 1; j < pids.length; j++) {
                addEdge(pids[i], pids[j]);
            }
        }
    }

    // 2. Concept-concept edges link all papers of source concept to all papers of target concept
    const conceptToPapers = new Map<string, number[]>();
    for (const node of apiNodes) conceptToPapers.set(node.id, node.paper_ids);

    for (const edge of apiEdges) {
        const srcPapers = conceptToPapers.get(edge.source) ?? [];
        const tgtPapers = conceptToPapers.get(edge.target) ?? [];
        for (const sp of srcPapers) {
            for (const tp of tgtPapers) {
                addEdge(sp, tp);
            }
        }
    }

    return result;
}

function gridLayoutPapers(paperGroups: Array<[number, PaperGroup]>): Map<string, { x: number; y: number }> {
    const n = paperGroups.length;
    const positions = new Map<string, { x: number; y: number }>();
    if (n === 0) return positions;

    const columns = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(n * 1.45))));
    const columnGap = 280;
    const rowGap = 132;
    const sideInset = 70;
    const topInset = 80;

    paperGroups.forEach(([pid], index) => {
        const row = Math.floor(index / columns);
        const col = index % columns;
        const rowCount = Math.min(columns, n - row * columns);
        const rowOffset = ((columns - rowCount) * columnGap) / 2;
        const stagger = row % 2 === 1 ? columnGap * 0.18 : 0;
        positions.set(`paper-${pid}`, {
            x: sideInset + rowOffset + col * columnGap + stagger,
            y: topInset + row * rowGap,
        });
    });

    return positions;
}

function getPaperLayoutedElements(
    apiNodes: RoadmapNode[],
    apiEdges: RoadmapEdge[],
    activeSubject: string | null,
    coursePaperIds?: Set<number>
): { rfNodes: Node[]; rfEdges: Edge[] } {
    if (apiNodes.length === 0) return { rfNodes: [], rfEdges: [] };

    const paperGroups = buildPaperGroups(apiNodes);
    const paperGroupsArray = [...paperGroups.entries()].sort((a, b) => {
        const subjectCompare = (a[1].subject_cluster || '').localeCompare(b[1].subject_cluster || '');
        if (subjectCompare !== 0) return subjectCompare;
        return a[1].title.localeCompare(b[1].title);
    });
    const paperPaperEdges = buildPaperPaperEdges(apiNodes, apiEdges);

    const paperPositions = gridLayoutPapers(paperGroupsArray);

    const rfNodes: Node[] = [];
    const rfEdges: Edge[] = [];

    paperGroupsArray.forEach(([pid, pg], idx) => {
        const paperId = `paper-${pid}`;
        const pos = paperPositions.get(paperId) ?? { x: idx * 260, y: 0 };
        const filtered = (activeSubject ? pg.concepts.every((c) => c.subject_cluster !== activeSubject) : false)
            || (coursePaperIds ? !coursePaperIds.has(pid) : false);

        const paperNodeData: PaperNodeData = {
            paper_id: pid,
            title: pg.title,
            mastery_state: pg.mastery_state,
            concept_count: pg.concepts.length,
            subject_cluster: pg.concepts[0]?.subject_cluster ?? '',
            filtered,
            animIndex: idx,
        };

        rfNodes.push({
            id: paperId,
            type: 'paper',
            position: { x: pos.x - PAPER_NODE_WIDTH / 2, y: pos.y - PAPER_NODE_HEIGHT / 2 },
            data: paperNodeData,
            selectable: true,
            draggable: true,
        });
    });

    for (const pe of paperPaperEdges) {
        rfEdges.push({
            id: `ppe-${pe.source}-${pe.target}`,
            source: pe.source,
            target: pe.target,
            style: { stroke: 'var(--primary)', strokeWidth: 1.1, strokeOpacity: 0.16 },
            animated: false,
        });
    }

    return { rfNodes, rfEdges };
}

// ── Inner canvas component (needs useReactFlow hook) ──────────────────────────

interface CanvasProps {
    rfNodes: Node[];
    rfEdges: Edge[];
    viewMode: Exclude<ViewMode, 'list'>;
    onNodeSelect: (nodeId: string | null) => void;
    selectedId: string | null;
    flyToRef: React.MutableRefObject<((id: string) => void) | null>;
    fitViewRef: React.MutableRefObject<(() => void) | null>;
    savedViewport?: Viewport;
    onViewportSave: (viewMode: Exclude<ViewMode, 'list'>, viewport: Viewport) => void;
}

function RoadmapCanvas({
    rfNodes,
    rfEdges,
    viewMode,
    onNodeSelect,
    selectedId,
    flyToRef,
    fitViewRef,
    savedViewport,
    onViewportSave,
}: CanvasProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);
    const { fitView, setCenter, setViewport } = useReactFlow();
    const didInitialViewport = useRef(false);
    const lastViewModeRef = useRef(viewMode);

    // Sync React Flow internal state when parent recomputes layout
    useEffect(() => {
        setNodes(rfNodes.map((node) => ({ ...node, selected: selectedId === node.id })));
    }, [rfNodes, selectedId, setNodes]);

    useEffect(() => {
        if (lastViewModeRef.current !== viewMode) {
            didInitialViewport.current = false;
            lastViewModeRef.current = viewMode;
        }
    }, [viewMode]);

    useEffect(() => {
        if (rfNodes.length === 0 || didInitialViewport.current) return;
        didInitialViewport.current = true;

        if (savedViewport) {
            setTimeout(() => {
                setViewport(savedViewport, { duration: 0 });
            }, 80);
            return;
        }

        const padding = viewMode === 'papers' ? 0.18 : 0.14;
        setTimeout(() => {
            fitView({
                padding,
                duration: 0,
                minZoom: viewMode === 'papers' ? 0.7 : 0.35,
                maxZoom: viewMode === 'papers' ? 1.05 : 1.15,
            });
        }, 120);
    }, [fitView, rfNodes.length, savedViewport, setViewport, viewMode]);

    useOnViewportChange({
        onEnd: (viewport) => {
            if (didInitialViewport.current) {
                onViewportSave(viewMode, viewport);
            }
        },
    });

    useEffect(() => {
        fitViewRef.current = () => {
            setTimeout(() => {
                fitView({
                    padding: viewMode === 'papers' ? 0.18 : 0.14,
                    duration: 600,
                    minZoom: viewMode === 'papers' ? 0.7 : 0.35,
                    maxZoom: viewMode === 'papers' ? 1.05 : 1.15,
                });
            }, 20);
        };
    }, [fitView, fitViewRef, viewMode]);

    useEffect(() => {
        setEdges(rfEdges);
    }, [rfEdges, setEdges]);

    // Expose flyToNode
    useEffect(() => {
        flyToRef.current = (id: string) => {
            const n = rfNodes.find((x) => x.id === id);
            if (n) {
                setCenter(
                    n.position.x + (viewMode === 'papers' ? PAPER_NODE_WIDTH / 2 : 40),
                    n.position.y + (viewMode === 'papers' ? PAPER_NODE_HEIGHT / 2 : 40),
                    { zoom: viewMode === 'papers' ? 0.95 : 1.2, duration: 600 }
                );
            }
        };
    }, [rfNodes, setCenter, flyToRef, viewMode]);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodeClick={(_, node) => onNodeSelect(node.id)}
            onPaneClick={() => onNodeSelect(null)}
            defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
            minZoom={0.1}
            maxZoom={2.5}
            fitView={false}
            proOptions={{ hideAttribution: true }}
            style={{ background: 'transparent' }}
            selectNodesOnDrag={false}
            elevateEdgesOnSelect
        >
            <Background
                variant={BackgroundVariant.Dots}
                gap={28}
                size={1}
                color="rgba(99,102,241,0.12)"
            />
            <Controls
                style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    boxShadow: 'var(--shadow-md)',
                }}
                showInteractive={false}
            />
        </ReactFlow>
    );
}

// ── List View ─────────────────────────────────────────────────────────────────

const MASTERY_LABELS: Record<number, string> = {
    1: 'Discovered',
    2: 'Reading',
    3: 'Engaged',
    4: 'Mastered',
};
const MASTERY_COLORS: Record<number, string> = {
    1: '#94a3b8',
    2: 'var(--primary)',
    3: 'var(--primary)',
    4: 'var(--warning)',
};

// Study Tracker weekly goal (same key as StudyTracker.tsx) — used to default plan hours
const STUDY_TRACKER_WEEKLY_GOAL_KEY = 'mylibrary_weekly_goal_hours';

function loadStudyTrackerWeeklyGoalHours(): number | null {
    try {
        const v = localStorage.getItem(STUDY_TRACKER_WEEKLY_GOAL_KEY);
        if (v == null || v === '') return null;
        const n = Number(v);
        return n > 0 && n < 1000 ? n : null;
    } catch {
        return null;
    }
}

// ── Study Plan Helpers ─────────────────────────────────────────────────────────

function getLocalTodayIso(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function findCurrentPlanDay(plan: StudyPlan | null): StudyPlanDay | null {
    if (!plan || !plan.days || plan.days.length === 0) return null;
    const today = getLocalTodayIso();
    const exact = plan.days.find((d) => d.date === today);
    if (exact) return exact;
    // Fallback: first upcoming day after today, or last day if all are in the past
    const upcoming = [...plan.days]
        .sort((a, b) => a.sequence - b.sequence)
        .find((d) => d.date > today);
    return upcoming ?? plan.days[plan.days.length - 1];
}

// ── Today's tasks checklist (visible when plan exists) ───────────────────────────

function TodaysTasksChecklist({
    day,
    plan,
    nodes,
    onToggleTask,
    onStartTask,
    onOpenPaper,
    onFlyToNode,
}: {
    day: StudyPlanDay;
    plan: StudyPlan;
    nodes: RoadmapNode[];
    onToggleTask: (d: StudyPlanDay, t: StudyPlanTask) => void;
    onStartTask: (t: StudyPlanTask) => void;
    onOpenPaper: (paperId: string) => void;
    onFlyToNode: (nodeId: string) => void;
}) {
    const nodeName = (nodeId: string | null | undefined) => {
        if (!nodeId) return null;
        const n = nodes.find((x) => x.id === nodeId);
        return n?.name ?? nodeId;
    };

    if (!day.tasks || day.tasks.length === 0) {
        return (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No tasks scheduled for this day.
            </p>
        );
    }

    return (
        <ul className="space-y-2">
            {day.tasks.map((task) => {
                const label =
                    (task.label && task.label.trim()) ||
                    (task.type === 'concept'
                        ? nodeName(task.roadmap_node_id) ?? 'Concept'
                        : task.type === 'reading'
                          ? task.section_heading ?? (task.paper_id ? `Paper #${task.paper_id}` : 'Reading')
                          : task.paper_id ? `Quiz (paper #${task.paper_id})` : 'Quiz');
                const typeLabel = task.type === 'reading' ? 'Reading' : task.type === 'quiz' ? 'Quiz' : 'Concept';
                const isDone = task.status === 'done';
                return (
                    <li
                        key={task.id}
                        className="flex flex-col gap-2 py-2.5 px-3 rounded-xl"
                        style={{
                            background: isDone ? 'var(--bg-secondary)' : 'var(--surface)',
                            border: '1px solid var(--border)',
                        }}
                    >
                        <div className="flex items-start gap-3 min-w-0">
                            <button
                                type="button"
                                onClick={() => onToggleTask(day, task)}
                                className="flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors mt-0.5"
                                style={{
                                    borderColor: isDone ? 'var(--primary)' : 'var(--border)',
                                    background: isDone ? 'var(--primary)' : 'transparent',
                                }}
                                aria-label={isDone ? 'Mark pending' : 'Mark done'}
                            >
                                {isDone && (
                                    <span className="text-xs leading-none text-white">✓</span>
                                )}
                            </button>
                            <div
                                className="flex-1 min-w-0 w-full"
                                style={{ writingMode: 'horizontal-tb', minWidth: 0 }}
                            >
                                <span
                                    className="text-xs font-medium block break-words"
                                    style={{
                                        color: isDone ? 'var(--text-muted)' : 'var(--text)',
                                        textDecoration: isDone ? 'line-through' : undefined,
                                    }}
                                >
                                    <span className="capitalize text-[var(--text-muted)]">{typeLabel}: </span>
                                    {label}
                                </span>
                                <span className="text-[11px] block mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                    ~{task.estimated_minutes} min
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap pl-8">
                            {task.roadmap_node_id && (
                                <button
                                    type="button"
                                    onClick={() => onFlyToNode(task.roadmap_node_id!)}
                                    className="text-[11px] px-2 py-1 rounded-lg font-medium"
                                    style={{
                                        background: 'var(--primary-light)',
                                        color: 'var(--primary)',
                                    }}
                                >
                                    Focus
                                </button>
                            )}
                            {task.paper_id != null && (
                                <button
                                    type="button"
                                    onClick={() => onOpenPaper(String(task.paper_id))}
                                    className="text-[11px] px-2 py-1 rounded-lg font-medium"
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    {task.type === 'quiz' ? 'Quiz' : 'Open paper'}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => onStartTask(task)}
                                className="text-[11px] px-2 py-1 rounded-lg font-medium"
                                style={{
                                    background: 'var(--primary)',
                                    color: '#fff',
                                }}
                            >
                                Start
                            </button>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

function RoadmapListView({
    nodes,
    activeSubject,
    activeCourseSet,
    onNavigateToPaper,
}: {
    nodes: RoadmapNode[];
    activeSubject: string | null;
    activeCourseSet?: Set<number>;
    onNavigateToPaper: (id: string) => void;
}) {
    const [sort, setSort] = useState<'name' | 'mastery' | 'type'>('mastery');
    const filtered = nodes.filter((n) => {
        if (activeSubject && n.subject_cluster !== activeSubject) return false;
        if (activeCourseSet && !n.paper_ids.some((pid) => activeCourseSet.has(pid))) return false;
        return true;
    });
    const sorted = [...filtered].sort((a, b) => {
        if (sort === 'mastery') return b.mastery_state - a.mastery_state;
        if (sort === 'name') return a.name.localeCompare(b.name);
        return a.type.localeCompare(b.type);
    });

    return (
        <div className="max-w-[1100px] mx-auto px-6 sm:px-8 md:px-10 py-6">
            {/* Sort controls */}
            <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    Sort by:
                </span>
                {(['mastery', 'name', 'type'] as const).map((s) => (
                    <button
                        key={s}
                        onClick={() => setSort(s)}
                        className="text-xs px-3 py-1.5 rounded-full font-medium capitalize transition-all"
                        style={{
                            background: sort === s ? 'var(--primary)' : 'var(--bg-secondary)',
                            color: sort === s ? '#fff' : 'var(--text-muted)',
                        }}
                    >
                        {s}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div
                className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid var(--border)' }}
            >
                <table className="w-full">
                    <thead>
                        <tr style={{ background: 'var(--bg-secondary)' }}>
                            {['Concept', 'Type', 'Found In', 'Mastery'].map((h) => (
                                <th
                                    key={h}
                                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((n, i) => {
                            const paperEntries = Object.entries(n.paper_titles).slice(0, 3);
                            return (
                                <tr
                                    key={n.id}
                                    style={{
                                        borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined,
                                        background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg-secondary)',
                                    }}
                                >
                                    {/* Concept */}
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                                                {n.name}
                                            </span>
                                            {n.description && (
                                                <span
                                                    className="text-xs leading-snug"
                                                    style={{ color: 'var(--text-muted)' }}
                                                >
                                                    {n.description.length > 60
                                                        ? n.description.slice(0, 59) + '…'
                                                        : n.description}
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Type */}
                                    <td className="px-4 py-3">
                                        <span
                                            className="text-xs px-2 py-1 rounded-full font-medium capitalize"
                                            style={{
                                                background: 'var(--primary-light)',
                                                color: 'var(--primary)',
                                            }}
                                        >
                                            {n.type}
                                        </span>
                                    </td>

                                    {/* Found In */}
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            {paperEntries.map(([pid, title]) => (
                                                <button
                                                    key={pid}
                                                    onClick={() => onNavigateToPaper(pid)}
                                                    className="text-xs text-left hover:underline truncate max-w-[180px]"
                                                    style={{ color: 'var(--primary)' }}
                                                    title={title}
                                                >
                                                    {title || `Paper #${pid}`}
                                                </button>
                                            ))}
                                            {Object.keys(n.paper_titles).length > 3 && (
                                                <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                                                    +{Object.keys(n.paper_titles).length - 3} more
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Mastery */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="flex gap-1">
                                                {[1, 2, 3, 4].map((dot) => (
                                                    <div
                                                        key={dot}
                                                        style={{
                                                            width: 7,
                                                            height: 7,
                                                            borderRadius: '50%',
                                                            background:
                                                                dot <= n.mastery_state
                                                                    ? MASTERY_COLORS[n.mastery_state]
                                                                    : 'rgba(148,163,184,0.25)',
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                            <span
                                                className="text-xs font-medium"
                                                style={{ color: MASTERY_COLORS[n.mastery_state] }}
                                            >
                                                {MASTERY_LABELS[n.mastery_state]}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onGenerate, loading }: { onGenerate: () => void; loading: boolean }) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-8 px-6">
            {/* Faint graph illustration */}
            <svg
                width="180"
                height="140"
                viewBox="0 0 180 140"
                fill="none"
                style={{ opacity: 0.15 }}
            >
                <circle cx="90" cy="30" r="20" stroke="var(--primary)" strokeWidth="2.5" />
                <circle cx="30" cy="110" r="20" stroke="var(--primary)" strokeWidth="2.5" />
                <circle cx="150" cy="110" r="20" stroke="var(--primary)" strokeWidth="2.5" />
                <circle cx="90" cy="80" r="14" stroke="var(--primary)" strokeWidth="2" />
                <line x1="90" y1="50" x2="90" y2="66" stroke="var(--primary)" strokeWidth="2" />
                <line x1="77" y1="89" x2="47" y2="95" stroke="var(--primary)" strokeWidth="2" />
                <line x1="103" y1="89" x2="133" y2="95" stroke="var(--primary)" strokeWidth="2" />
                <line x1="50" y1="110" x2="130" y2="110" stroke="var(--primary)" strokeWidth="2" />
            </svg>

            <div className="text-center space-y-3 max-w-md">
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
                    Add papers to get started
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    Upload papers to your library and your knowledge map will be built
                    automatically — no setup needed.
                </p>
            </div>

            <button
                onClick={onGenerate}
                disabled={loading}
                className="px-8 py-3 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all disabled:opacity-60"
                style={{
                    background: 'var(--gradient-primary)',
                    color: '#fff',
                    boxShadow: 'var(--glow-primary)',
                }}
            >
                {loading ? (
                    <>
                        <span className="animate-spin">⟳</span> Starting…
                    </>
                ) : (
                    'Generate My Roadmap'
                )}
            </button>
        </div>
    );
}

// ── Generating State ──────────────────────────────────────────────────────────

function GeneratingState({ conceptCount, paperCount }: { conceptCount: number; paperCount: number }) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="relative w-20 h-20">
                <div
                    className="absolute inset-0 rounded-full border-4 border-transparent animate-spin"
                    style={{ borderTopColor: 'var(--primary)', borderRightColor: 'rgba(99,102,241,0.3)' }}
                />
                <div
                    className="absolute inset-3 rounded-full border-2 border-transparent animate-spin"
                    style={{ borderTopColor: 'rgba(99,102,241,0.5)', animationDirection: 'reverse', animationDuration: '0.8s' }}
                />
            </div>
            <div className="text-center space-y-1.5">
                <p className="font-semibold text-base" style={{ color: 'var(--text)' }}>
                    Building your knowledge map…
                </p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Extracting concepts from {paperCount > 0 ? `${paperCount} papers` : 'your library'}.
                    This takes 1-2 minutes.
                </p>
                {conceptCount > 0 && (
                    <p className="text-xs font-medium" style={{ color: 'var(--primary)' }}>
                        {conceptCount} concepts extracted so far…
                    </p>
                )}
            </div>
        </div>
    );
}

function PaperSidePanel({
    paper,
    onClose,
    onOpenPaper,
    onSelectConcept,
    onAskLibrarian,
}: {
    paper: PaperGroup | null;
    onClose: () => void;
    onOpenPaper: (paperId: string) => void;
    onSelectConcept: (conceptId: string) => void;
    onAskLibrarian?: (prompt: string) => void;
}) {
    if (!paper) return null;
    const concepts = [...paper.concepts].sort((a, b) => {
        if (b.mastery_state !== a.mastery_state) return b.mastery_state - a.mastery_state;
        return b.importance - a.importance;
    });
    const subjects = [...new Set(concepts.map((concept) => concept.subject_cluster).filter(Boolean))];
    const mastery = MASTERY_LABELS[paper.mastery_state] ?? 'Discovered';
    const masteryColor = MASTERY_COLORS[paper.mastery_state] ?? 'var(--text-muted)';

    return (
        <motion.div
            key={`paper-panel-${paper.paper_id}`}
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="fixed right-0 top-16 bottom-0 z-40 flex w-[360px] max-w-[100vw] flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--surface)] shadow-[-8px_0_32px_rgba(0,0,0,0.12)]"
        >
            <div className="flex items-start justify-between border-b border-[var(--border-subtle)] p-5 pb-4">
                <div className="min-w-0 flex-1 pr-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Paper
                    </p>
                    <h2 className="text-lg font-bold leading-tight text-[var(--text)]">
                        {paper.title}
                    </h2>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                            className="rounded-full px-2 py-1 text-xs font-semibold"
                            style={{ background: 'var(--bg-secondary)', color: masteryColor }}
                        >
                            {mastery}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                            {concepts.length} concept{concepts.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                    aria-label="Close paper panel"
                >
                    x
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
                {subjects.length > 0 && (
                    <div className="mb-5 flex flex-wrap gap-1.5">
                        {subjects.slice(0, 4).map((subject) => (
                            <span
                                key={subject}
                                className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)]"
                            >
                                {subject}
                            </span>
                        ))}
                    </div>
                )}

                <div className="border-y border-[var(--border)]/70 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Concepts in this paper
                    </p>
                    <div className="mt-3 space-y-2">
                        {concepts.map((concept) => (
                            <button
                                key={concept.id}
                                type="button"
                                onClick={() => onSelectConcept(concept.id)}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-light)]"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <span className="text-sm font-semibold leading-snug text-[var(--text)]">
                                        {concept.name}
                                    </span>
                                    <span className="shrink-0 text-[11px] font-medium" style={{ color: MASTERY_COLORS[concept.mastery_state] }}>
                                        {MASTERY_LABELS[concept.mastery_state]}
                                    </span>
                                </div>
                                {concept.description && (
                                    <p className="mt-1 line-clamp-2 text-xs leading-snug text-[var(--text-muted)]">
                                        {concept.description}
                                    </p>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="space-y-2 border-t border-[var(--border-subtle)] p-4">
                <button
                    onClick={() => onOpenPaper(String(paper.paper_id))}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white"
                    style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--glow-primary)' }}
                >
                    Open Paper
                </button>
                {onAskLibrarian && (
                    <button
                        onClick={() => onAskLibrarian(`Answer from my library: explain how the concepts in "${paper.title}" connect, and suggest the best order to study them.`)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 text-sm font-medium text-[var(--primary)]"
                    >
                        Ask Librarian
                    </button>
                )}
            </div>
        </motion.div>
    );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS: Array<{ state: number; label: string; style: string }> = [
    { state: 1, label: 'Discovered', style: 'border: 2px solid #94a3b8; background: transparent;' },
    { state: 2, label: 'Reading', style: 'border: 2px solid var(--primary); background: #fff;' },
    { state: 3, label: 'Engaged', style: 'background: var(--primary);' },
    { state: 4, label: 'Mastered', style: 'background: var(--gradient-primary); border: 2px solid var(--warning);' },
];

function Toolbar({
    conceptCount,
    paperCount,
    subjects,
    activeSubject,
    onSubjectChange,
    courses,
    activeCourseId,
    onCourseChange,
    viewMode,
    onViewChange,
    onRegenerate,
    isGenerating,
    onFitView,
}: {
    conceptCount: number;
    paperCount: number;
    subjects: string[];
    activeSubject: string | null;
    onSubjectChange: (s: string | null) => void;
    courses: { id: number; name: string }[];
    activeCourseId: number | null;
    onCourseChange: (id: number | null) => void;
    viewMode: ViewMode;
    onViewChange: (v: ViewMode) => void;
    onRegenerate: () => void;
    isGenerating: boolean;
    onFitView: () => void;
}) {
    return (
        <div
            className="flex items-center justify-between px-6 sm:px-8 py-4 gap-4 flex-wrap"
            style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderBottom: '1px solid var(--border)',
                zIndex: 20,
                flexShrink: 0,
            }}
        >
            {/* Left: title */}
            <div>
                <h1 className="text-2xl font-extrabold tracking-tight font-display" style={{ color: 'var(--text)' }}>
                    My Knowledge Roadmap
                </h1>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {conceptCount > 0
                        ? `${paperCount} papers · ${conceptCount} concepts`
                        : 'No map yet'}
                </p>
            </div>

            {/* Right: controls */}
            <div className="flex items-center gap-3 flex-wrap">
                {/* Subject filter */}
                {subjects.length > 0 && (
                    <select
                        value={activeSubject ?? ''}
                        onChange={(e) => onSubjectChange(e.target.value || null)}
                        className="text-sm px-3 py-2 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            color: 'var(--text)',
                            cursor: 'pointer',
                        }}
                    >
                        <option value="">All Subjects</option>
                        {subjects.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                )}

                {courses.length > 0 && (
                    <select
                        value={activeCourseId ?? ''}
                        onChange={(e) => onCourseChange(e.target.value ? Number(e.target.value) : null)}
                        className="text-sm px-3 py-2 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            color: 'var(--text)',
                            cursor: 'pointer',
                        }}
                    >
                        <option value="">All Courses</option>
                        {courses.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                )}

                {/* Divider */}
                <div className="h-6 w-px" style={{ background: 'var(--border)' }} />

                {/* Graph / List toggle */}
                <div
                    className="flex rounded-lg overflow-hidden"
                    style={{ border: '1px solid var(--border)' }}
                >
                    {(['papers', 'concepts', 'list'] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => onViewChange(m)}
                            className="text-sm px-4 py-2 font-medium transition-colors capitalize"
                            style={{
                                background: viewMode === m ? 'var(--primary)' : 'var(--surface)',
                                color: viewMode === m ? '#fff' : 'var(--text-muted)',
                            }}
                        >
                            {m}
                        </button>
                    ))}
                </div>

                {/* Fit view (graph views only) */}
                {viewMode !== 'list' && (
                    <button
                        onClick={onFitView}
                        title="Fit to screen"
                        className="text-sm px-3 py-2 rounded-lg font-medium transition-colors hover:bg-[var(--bg-secondary)]"
                        style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-muted)',
                        }}
                    >
                        ⤢
                    </button>
                )}

                {/* Regenerate */}
                <button
                    onClick={onRegenerate}
                    disabled={isGenerating}
                    className="text-sm px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
                    style={{
                        background: 'var(--gradient-primary)',
                        color: '#fff',
                        boxShadow: 'var(--glow-primary)',
                    }}
                >
                    <span className={isGenerating ? 'animate-spin inline-block' : ''}>⟳</span>
                    {isGenerating ? 'Updating…' : 'Update Map'}
                </button>

                {/* Divider */}
                <div className="h-6 w-px" style={{ background: 'var(--border)' }} />

                {/* Legend */}
                <div className="flex items-center gap-3">
                    {LEGEND_ITEMS.map((item) => (
                        <div key={item.state} className="flex items-center gap-1.5">
                            <div
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    flexShrink: 0,
                                    ...Object.fromEntries(
                                        item.style.split(';')
                                            .filter(Boolean)
                                            .map((s) => {
                                                const [k, v] = s.split(':').map((x) => x.trim());
                                                return [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v];
                                            })
                                    ),
                                }}
                            />
                            <span className="text-xs hidden lg:block" style={{ color: 'var(--text-muted)' }}>
                                {item.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Main RoadmapPage ──────────────────────────────────────────────────────────

const RoadmapPage: React.FC<Props> = ({ onNavigateToPaper, onNavigateToSummary, onAskLibrarian, initialCourseId }) => {
    const [status, setStatus] = useState<Status>('loading');
    const [apiData, setApiData] = useState<RoadmapData | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('papers');
    const [activeSubject, setActiveSubject] = useState<string | null>(null);
    const [activeCourseId, setActiveCourseId] = useState<number | null>(initialCourseId ?? null);
    const [roadmapCourses, setRoadmapCourses] = useState<{ id: number; name: string; paperIds: number[] }[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);
    const [savedViewports, setSavedViewports] = useState<Partial<Record<Exclude<ViewMode, 'list'>, Viewport>>>({});
    const [upgradingNodeIds, setUpgradingNodeIds] = useState<Set<string>>(new Set());
    const [activePlan, setActivePlan] = useState<StudyPlan | null>(null);
    const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
    const [planHoursPerWeek, setPlanHoursPerWeek] = useState<number>(() => {
        const goal = loadStudyTrackerWeeklyGoalHours();
        return goal != null ? goal : 6;
    });
    const [planExamDate, setPlanExamDate] = useState<string>('');
    const [planExamTopics, setPlanExamTopics] = useState<string>(''); // comma-separated, e.g. "ML, Physics"
    const [isSavingPlan, setIsSavingPlan] = useState(false);
    const [isRecomputingPlan, setIsRecomputingPlan] = useState(false);
    const [planPanelOpen, setPlanPanelOpen] = useState(false);
    const flyToRef = useRef<((id: string) => void) | null>(null);
    const fitViewRef = useRef<(() => void) | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Detect mobile → default to list view
    useEffect(() => {
        if (window.innerWidth < 768) setViewMode('list');
    }, []);

    // Reset paper/concept selection when switching views
    const handleViewChange = useCallback((v: ViewMode) => {
        setViewMode(v);
        setSelectedPaperId(null);
        setSelectedNodeId(null);
    }, []);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const startPolling = useCallback(() => {
        stopPolling();
        pollRef.current = setInterval(async () => {
            try {
                const s = await getRoadmapStatus();
                if (s.status === 'ready') {
                    stopPolling();
                    const full = await getRoadmap();
                    setApiData(full);
                    setStatus('ready');
                    setSavedViewports({});
                } else if (s.status === 'error') {
                    stopPolling();
                    setStatus('error');
                }
                // still processing: continue polling
            } catch {
                // network hiccup, keep polling
            }
        }, 3000);
    }, [stopPolling]);

    // Lightweight mastery refresh — no AI, pure DB queries. Refetch full graph so Mastered always shows.
    const updateMasteryStates = useCallback(async () => {
        try {
            const { updated_nodes } = await getMasteryUpdate();
            const fresh = await getRoadmap();
            if (fresh.status === 'ready' && fresh.nodes.length > 0) {
                setApiData(fresh);
            }
            if (updated_nodes.length > 0) {
                const ids = new Set(updated_nodes.map((u) => u.id));
                setUpgradingNodeIds(ids);
                setTimeout(() => setUpgradingNodeIds(new Set()), 800);
            }
        } catch {
            // Non-critical — silently ignore
        }
    }, []);

    // Initial load — auto-generates if no roadmap exists yet, auto-refreshes if new papers were added
    useEffect(() => {
        const load = async () => {
            try {
                const data = await getRoadmap();

                if (data.status === 'processing') {
                    // Already generating (e.g. from a previous session) — just poll
                    setStatus('generating');
                    startPolling();
                } else if (data.status === 'ready' && data.nodes.length > 0) {
                    setApiData(data);
                    setStatus('ready');
                    updateMasteryStates();

                    // Silently check if new papers were added since last generation.
                    // If so, kick off a background regeneration but keep showing the current graph.
                    try {
                        const libraryCount = await getLibraryPaperCount();
                        const cachedCount = data.paper_count ?? 0;
                        if (libraryCount > cachedCount) {
                            generateRoadmap().catch(() => {});
                            // Silent background poll — does NOT flip status to 'generating'
                            const silentPoll = setInterval(async () => {
                                try {
                                    const s = await getRoadmapStatus();
                                    if (s.status === 'ready') {
                                        clearInterval(silentPoll);
                                        const fresh = await getRoadmap();
                                        setApiData(fresh);
                                    } else if (s.status === 'error') {
                                        clearInterval(silentPoll);
                                    }
                                } catch { /* network hiccup, keep polling */ }
                            }, 5000);
                        }
                    } catch {
                        // Staleness check failed — not critical, keep showing current graph
                    }
                } else {
                    // status is 'empty', 'error', or ready with 0 nodes — auto-generate
                    setStatus('generating');
                    try {
                        await generateRoadmap();
                        startPolling();
                    } catch {
                        setStatus('error');
                    }
                }

                // Load any existing active study plan once roadmap state is known
                try {
                    const plan = await getActiveStudyPlan();
                    setActivePlan(plan);
                } catch {
                    setActivePlan(null);
                }
            } catch {
                setStatus('error');
            }
        };
        load();
        // Load courses for filter dropdown (best-effort, non-blocking)
        getCourses().then((cs) => {
            setRoadmapCourses(cs.map((c) => ({
                id: c.id,
                name: c.name,
                paperIds: c.papers.map((p) => p.paper_id),
            })));
        }).catch(() => {});
        return () => stopPolling();
    }, [startPolling, stopPolling, updateMasteryStates]);

    const handleGenerate = useCallback(async () => {
        setStatus('generating');
        setSelectedNodeId(null);
        setSelectedPaperId(null);
        setSavedViewports({});
        try {
            await generateRoadmap();
            startPolling();
        } catch {
            setStatus('error');
        }
    }, [startPolling]);

    const handleOpenPlanModal = useCallback(() => {
        const goal = loadStudyTrackerWeeklyGoalHours();
        if (goal != null) setPlanHoursPerWeek(goal);
        setIsPlanModalOpen(true);
    }, []);

    const handleCreatePlan = useCallback(async () => {
        if (planHoursPerWeek <= 0) return;
        setIsSavingPlan(true);
        try {
            const plan = await generateStudyPlan({
                hoursPerWeek: planHoursPerWeek,
                startsAt: getLocalTodayIso(),
                examDate: planExamDate || undefined,
                examTopics: planExamTopics.trim() ? planExamTopics.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
            });
            setActivePlan(plan);
            setIsPlanModalOpen(false);
        } catch (err) {
            console.error('Failed to generate study plan', err);
        } finally {
            setIsSavingPlan(false);
        }
    }, [planHoursPerWeek, planExamDate, planExamTopics]);

    const handleToggleTask = useCallback(
        async (day: StudyPlanDay, task: StudyPlanTask) => {
            if (!activePlan) return;
            const newStatus = task.status === 'done' ? 'pending' : 'done';
            try {
                if (newStatus === 'done') {
                    await endStudySession();
                }
            } catch {
                // best-effort only
            }
            try {
                const updated = await updateStudyPlanTask(activePlan.id, task.id, {
                    status: newStatus,
                });
                setActivePlan(updated);

                // After marking done, adaptively reschedule any overdue pending tasks
                if (newStatus === 'done') {
                    try {
                        const result = await recomputeStudyPlan(activePlan.id);
                        if (result.diff.moved_tasks.length > 0) {
                            setActivePlan(result.plan);
                        }
                    } catch {
                        // non-critical — plan already updated above
                    }
                }
            } catch (err) {
                console.error('Failed to update plan task', err);
            }
        },
        [activePlan],
    );

    const handleStartTask = useCallback(
        async (task: StudyPlanTask) => {
            try {
                if (task.type === 'reading' && task.paper_id != null) {
                    await startStudySession('reading', 'plan', String(task.paper_id));
                } else if (task.type === 'quiz' && task.paper_id != null) {
                    await startStudySession('reading', 'plan-quiz', String(task.paper_id));
                } else {
                    await startStudySession('home', 'plan', null);
                }
            } catch {
                // ignore
            }
        },
        [],
    );

    const handleRebalancePlan = useCallback(async () => {
        if (!activePlan) return;
        setIsRecomputingPlan(true);
        try {
            // Regenerate from scratch with the same hours/week so the new
            // spaced-repetition scheduler is applied (Rebalance = fresh generate).
            const plan = await generateStudyPlan({
                hoursPerWeek: activePlan.hours_per_week,
                startsAt: getLocalTodayIso(),
                examDate: planExamDate || undefined,
                examTopics: planExamTopics.trim()
                    ? planExamTopics.split(',').map((t) => t.trim()).filter(Boolean)
                    : undefined,
            });
            setActivePlan(plan);
        } catch (err) {
            console.error('Failed to rebalance study plan', err);
        } finally {
            setIsRecomputingPlan(false);
        }
    }, [activePlan, planExamDate, planExamTopics]);

    const handleUpdatePlanToStudyTrackerHours = useCallback(async () => {
        const goal = loadStudyTrackerWeeklyGoalHours();
        const hours = goal != null && goal > 0 ? goal : 6;
        setIsSavingPlan(true);
        try {
            const plan = await generateStudyPlan({
                hoursPerWeek: hours,
                startsAt: getLocalTodayIso(),
                examDate: planExamDate || undefined,
                examTopics: planExamTopics.trim() ? planExamTopics.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
            });
            setActivePlan(plan);
            setPlanHoursPerWeek(hours);
            setIsPlanModalOpen(false);
        } catch (err) {
            console.error('Failed to update plan', err);
        } finally {
            setIsSavingPlan(false);
        }
    }, [planExamDate, planExamTopics]);

    const handleFlyToNode = useCallback((nodeId: string) => {
        setSelectedNodeId(nodeId);
        setSelectedPaperId(null);
        if (viewMode === 'concepts') {
            setTimeout(() => flyToRef.current?.(nodeId), 80);
        }
    }, [viewMode]);

    const handleFitView = useCallback(() => {
        fitViewRef.current?.();
    }, []);

    const handleViewportSave = useCallback((mode: Exclude<ViewMode, 'list'>, viewport: Viewport) => {
        setSavedViewports((prev) => ({ ...prev, [mode]: viewport }));
    }, []);

    // Course paper IDs set for filtering
    const activeCourseSet = useMemo(() => {
        if (activeCourseId === null) return undefined;
        const course = roadmapCourses.find((c) => c.id === activeCourseId);
        return course ? new Set<number>(course.paperIds) : undefined;
    }, [activeCourseId, roadmapCourses]);

    // Compute graph data — papers view or concepts view
    const { rfNodes, rfEdges } = useMemo(() => {
        if (!apiData || apiData.nodes.length === 0) return { rfNodes: [], rfEdges: [] };
        try {
            if (viewMode === 'papers') {
                return getPaperLayoutedElements(apiData.nodes, apiData.edges, activeSubject, activeCourseSet);
            }
            // Concepts view — original Dagre layout
            const visibleIds = new Set(apiData.nodes.map((n) => n.id));
            const edges = apiData.edges.filter(
                (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
            );
            const result = getLayoutedElements(apiData.nodes, edges, activeSubject, activeCourseSet);
            if (upgradingNodeIds.size > 0) {
                result.rfNodes = result.rfNodes.map((n) =>
                    upgradingNodeIds.has(n.id)
                        ? { ...n, data: { ...n.data, upgrading: true } }
                        : n,
                );
            }
            return result;
        } catch (err) {
            console.error('Roadmap layout failed:', err);
            return { rfNodes: [], rfEdges: [] };
        }
    }, [apiData, activeSubject, activeCourseSet, viewMode, upgradingNodeIds]);

    // Subjects for filter
    const subjects = useMemo(() => {
        if (!apiData) return [];
        return [...new Set(apiData.nodes.map((n) => n.subject_cluster))].filter(Boolean).sort();
    }, [apiData]);

    // Build a concept RF node from raw apiData (used in papers view where no concept RF nodes exist)
    const apiConceptToRfNode = useCallback((concept: RoadmapNode, idx: number): Node<ConceptNodeData> => ({
        id: concept.id,
        type: 'concept',
        position: { x: idx * 100, y: 0 },
        data: {
            name: concept.name,
            type: concept.type,
            description: concept.description,
            importance: concept.importance,
            mastery_state: concept.mastery_state,
            paper_ids: concept.paper_ids,
            paper_titles: concept.paper_titles,
            subject_cluster: concept.subject_cluster,
            filtered: false,
            animIndex: idx,
        },
        selectable: true,
        draggable: false,
    }), []);

    // Selected node — works in both views
    const selectedNode = useMemo((): Node<ConceptNodeData> | undefined => {
        if (!selectedNodeId) return undefined;
        const rfNode = rfNodes.find((n) => n.id === selectedNodeId && n.type === 'concept') as Node<ConceptNodeData> | undefined;
        if (rfNode) return rfNode;
        // Fallback: build from apiData (papers view)
        const concept = apiData?.nodes.find((n) => n.id === selectedNodeId);
        return concept ? apiConceptToRfNode(concept, 0) : undefined;
    }, [selectedNodeId, rfNodes, apiData, apiConceptToRfNode]);

    // All concept nodes for side panel
    const conceptNodes = useMemo((): Node<ConceptNodeData>[] => {
        const fromRf = rfNodes.filter((n) => n.type === 'concept') as Node<ConceptNodeData>[];
        if (fromRf.length > 0) return fromRf;
        return (apiData?.nodes ?? []).map((c, i) => apiConceptToRfNode(c, i));
    }, [rfNodes, apiData, apiConceptToRfNode]);

    const selectedPaper = useMemo((): PaperGroup | null => {
        if (!apiData || selectedPaperId == null) return null;
        return buildPaperGroups(apiData.nodes).get(selectedPaperId) ?? null;
    }, [apiData, selectedPaperId]);

    const isGenerating = status === 'generating';

    return (
        <>
            {/* Inject keyframe for node entrance animation */}
            <style>{`
                @keyframes rfNodeIn {
                    from { opacity: 0; transform: scale(0.55); }
                    to   { opacity: 1; transform: scale(1);    }
                }
                @keyframes rfNodeUpgrade {
                    0%   { transform: scale(1);    }
                    40%  { transform: scale(1.25); }
                    70%  { transform: scale(0.95); }
                    100% { transform: scale(1);    }
                }
                @keyframes edgeDash {
                    from { stroke-dashoffset: 0; }
                    to   { stroke-dashoffset: -22; }
                }
                .react-flow__node { overflow: visible !important; }
                .react-flow__controls button { color: var(--text-muted); }
                .react-flow__controls button:hover { color: var(--primary); }
            `}</style>

            <div
                className="flex flex-col"
                style={{ height: 'calc(100vh - 64px)', background: 'var(--bg)' }}
            >
                {/* Toolbar — only when we have data or are generating */}
                {(status === 'ready' || status === 'generating' || status === 'error') && (
                    <Toolbar
                        conceptCount={apiData?.concept_count ?? apiData?.nodes.length ?? 0}
                        paperCount={apiData?.paper_count ?? 0}
                        subjects={subjects}
                        activeSubject={activeSubject}
                        onSubjectChange={(s) => {
                            setActiveSubject(s);
                            setSelectedNodeId(null);
                            setSelectedPaperId(null);
                            setSavedViewports({});
                        }}
                        courses={roadmapCourses}
                        activeCourseId={activeCourseId}
                        onCourseChange={(id) => {
                            setActiveCourseId(id);
                            setSelectedNodeId(null);
                            setSelectedPaperId(null);
                            setSavedViewports({});
                        }}
                        viewMode={viewMode}
                        onViewChange={handleViewChange}
                        onRegenerate={handleGenerate}
                        isGenerating={isGenerating}
                        onFitView={handleFitView}
                    />
                )}

                {/* Main area */}
                <div className="flex-1 relative overflow-hidden">
                    <AnimatePresence mode="wait">
                        {status === 'loading' && (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 flex items-center justify-center"
                            >
                                <div className="flex flex-col items-center gap-4">
                                    <div
                                        className="w-12 h-12 rounded-full border-4 border-transparent animate-spin"
                                        style={{ borderTopColor: 'var(--primary)', borderRightColor: 'rgba(99,102,241,0.3)' }}
                                    />
                                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                        Loading roadmap…
                                    </p>
                                </div>
                            </motion.div>
                        )}

                        {status === 'empty' && (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0"
                            >
                                <EmptyState onGenerate={handleGenerate} loading={false} />
                            </motion.div>
                        )}

                        {status === 'generating' && (
                            <motion.div
                                key="generating"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0"
                            >
                                <GeneratingState
                                    conceptCount={apiData?.concept_count ?? 0}
                                    paperCount={apiData?.paper_count ?? 0}
                                />
                            </motion.div>
                        )}

                        {status === 'error' && (
                            <motion.div
                                key="error"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 flex flex-col items-center justify-center gap-4"
                            >
                                <p className="text-lg font-semibold" style={{ color: 'var(--danger)' }}>
                                    Generation failed
                                </p>
                                <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
                                    Generation failed. If you use a key from Google AI Studio (aistudio.google.com), the free tier is limited. To use Google Cloud $300 credits: create the key in Cloud Console (APIs &amp; Services → Credentials) in a project with billing enabled, and enable the &quot;Generative Language API&quot; for that project.
                                </p>
                                <button
                                    onClick={handleGenerate}
                                    className="px-6 py-2.5 rounded-xl font-semibold text-sm"
                                    style={{ background: 'var(--gradient-primary)', color: '#fff' }}
                                >
                                    Try Again
                                </button>
                            </motion.div>
                        )}

                        {status === 'ready' && (
                            <motion.div
                                key="ready"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="absolute inset-0 flex"
                            >
                                {/* Left: collapsible Today's plan panel */}
                                {!planPanelOpen ? (
                                    <button
                                        type="button"
                                        onClick={() => setPlanPanelOpen(true)}
                                        className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-24 rounded-r-lg flex items-center justify-center shadow-md"
                                        style={{
                                            background: 'var(--surface)',
                                            border: '1px solid var(--border)',
                                            borderLeft: 'none',
                                            color: 'var(--primary)',
                                        }}
                                        title="Open Today's plan"
                                    >
                                        <span
                                            className="text-xs font-semibold"
                                            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', display: 'inline-block' }}
                                        >
                                            Today&apos;s plan
                                        </span>
                                    </button>
                                ) : (
                                    <div
                                        className="w-72 flex-shrink-0 flex flex-col border-r z-20 overflow-y-auto"
                                        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                                    >
                                        <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                                            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                                                Today&apos;s plan
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setPlanPanelOpen(false)}
                                                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
                                                aria-label="Close panel"
                                            >
                                                ×
                                            </button>
                                        </div>
                                        <div className="p-3 space-y-3">
                                            {activePlan ? (
                                                <>
                                                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                                        {activePlan.hours_per_week} h/week · {findCurrentPlanDay(activePlan)?.date ?? activePlan.starts_at}
                                                    </p>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={handleRebalancePlan}
                                                            disabled={isRecomputingPlan}
                                                            className="text-[11px] px-2 py-1 rounded-lg border font-medium disabled:opacity-60"
                                                            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                                                        >
                                                            {isRecomputingPlan ? '…' : 'Rebalance'}
                                                        </button>
                                                        <button
                                                            onClick={handleOpenPlanModal}
                                                            className="text-[11px] px-2 py-1 rounded-lg font-medium border"
                                                            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                                                        >
                                                            Settings
                                                        </button>
                                                    </div>
                                                    {findCurrentPlanDay(activePlan) && (
                                                        <TodaysTasksChecklist
                                                            day={findCurrentPlanDay(activePlan)!}
                                                            plan={activePlan}
                                                            nodes={apiData?.nodes ?? []}
                                                            onToggleTask={handleToggleTask}
                                                            onStartTask={handleStartTask}
                                                            onOpenPaper={onNavigateToPaper}
                                                            onFlyToNode={handleFlyToNode}
                                                        />
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                        Get a 4‑week checklist from your roadmap. Hours follow your Study Tracker goal.
                                                    </p>
                                                    <button
                                                        onClick={handleOpenPlanModal}
                                                        className="w-full text-xs px-3 py-2 rounded-lg font-semibold"
                                                        style={{ background: 'var(--gradient-primary)', color: '#fff' }}
                                                    >
                                                        Create 4-week plan
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Graph / list (full width when panel closed, remaining width when open) */}
                                <div className="flex-1 relative overflow-hidden" style={{ minWidth: 0 }}>
                                {viewMode !== 'list' ? (
                                    <ReactFlowProvider key={`roadmap-flow-${viewMode}`}>
                                        <RoadmapCanvas
                                            rfNodes={rfNodes}
                                            rfEdges={rfEdges}
                                            viewMode={viewMode}
                                            onNodeSelect={(id) => {
                                                if (!id) {
                                                    setSelectedNodeId(null);
                                                    setSelectedPaperId(null);
                                                    return;
                                                }
                                                if (id.startsWith('paper-')) {
                                                    const pid = Number(id.replace('paper-', ''));
                                                    setSelectedPaperId(Number.isFinite(pid) ? pid : null);
                                                    setSelectedNodeId(null);
                                                } else {
                                                    setSelectedNodeId(id);
                                                    setSelectedPaperId(null);
                                                }
                                            }}
                                            selectedId={selectedNodeId ?? (selectedPaperId != null ? `paper-${selectedPaperId}` : null)}
                                            flyToRef={flyToRef}
                                            fitViewRef={fitViewRef}
                                            savedViewport={savedViewports[viewMode]}
                                            onViewportSave={handleViewportSave}
                                        />
                                    </ReactFlowProvider>
                                ) : (
                                    <div className="absolute inset-0 overflow-y-auto">
                                        <RoadmapListView
                                            nodes={apiData?.nodes ?? []}
                                            activeSubject={activeSubject}
                                            activeCourseSet={activeCourseSet}
                                            onNavigateToPaper={onNavigateToPaper}
                                        />
                                    </div>
                                )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Side panel */}
                    <NodeSidePanel
                        node={selectedNode ?? null}
                        allNodes={conceptNodes}
                        edges={apiData?.edges ?? []}
                        onClose={() => setSelectedNodeId(null)}
                        onNavigateToPaper={(pid) => {
                            setSelectedNodeId(null);
                            onNavigateToPaper(pid);
                        }}
                        onNavigateToSummary={(text) => {
                            setSelectedNodeId(null);
                            onNavigateToSummary(text);
                        }}
                        onFlyToNode={(id) => {
                            setSelectedNodeId(id);
                            flyToRef.current?.(id);
                        }}
                        onAskLibrarian={onAskLibrarian}
                    />
                    <AnimatePresence>
                        {!selectedNode && selectedPaper && (
                            <PaperSidePanel
                                paper={selectedPaper}
                                onClose={() => setSelectedPaperId(null)}
                                onOpenPaper={(pid) => {
                                    setSelectedPaperId(null);
                                    onNavigateToPaper(pid);
                                }}
                                onSelectConcept={(conceptId) => {
                                    setSelectedPaperId(null);
                                    setSelectedNodeId(conceptId);
                                }}
                                onAskLibrarian={onAskLibrarian}
                            />
                        )}
                    </AnimatePresence>
                </div>

                {/* Study plan modal */}
                {isPlanModalOpen && (
                    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
                        <div
                            className="w-full max-w-md rounded-2xl p-5 space-y-4"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                        >
                            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                                {activePlan ? 'Update 4-week plan' : 'Create 4-week learning plan'}
                            </h2>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                We prioritise low-mastery, high-importance concepts and schedule 2–3 tasks per day.
                                Hours per week use your <strong>Study Tracker weekly goal</strong> when set.
                            </p>
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                Reading tasks are estimated from your WPM.
                            </p>
                            <div className="space-y-3">
                                <label className="flex flex-col gap-1 text-xs">
                                    <span style={{ color: 'var(--text)' }}>Hours per week</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={40}
                                        value={planHoursPerWeek}
                                        onChange={(e) =>
                                            setPlanHoursPerWeek(
                                                Number.isNaN(Number(e.target.value)) ? 1 : Number(e.target.value),
                                            )
                                        }
                                        className="px-3 py-2 rounded-lg text-xs"
                                        style={{
                                            background: 'var(--bg)',
                                            border: '1px solid var(--border)',
                                            color: 'var(--text)',
                                        }}
                                    />
                                    {loadStudyTrackerWeeklyGoalHours() != null && (
                                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                            Prefilled from Study Tracker weekly goal.
                                        </span>
                                    )}
                                </label>
                                <label className="flex flex-col gap-1 text-xs">
                                    <span style={{ color: 'var(--text)' }}>
                                        Exam / deadline date <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
                                    </span>
                                    <input
                                        type="date"
                                        value={planExamDate}
                                        onChange={(e) => setPlanExamDate(e.target.value)}
                                        className="px-3 py-2 rounded-lg text-xs"
                                        style={{
                                            background: 'var(--bg)',
                                            border: '1px solid var(--border)',
                                            color: 'var(--text)',
                                        }}
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-xs">
                                    <span style={{ color: 'var(--text)' }}>
                                        Exam topics <span style={{ color: 'var(--text-muted)' }}>(optional, comma-separated)</span>
                                    </span>
                                    <input
                                        type="text"
                                        value={planExamTopics}
                                        onChange={(e) => setPlanExamTopics(e.target.value)}
                                        placeholder="e.g. Machine Learning, Physics"
                                        className="px-3 py-2 rounded-lg text-xs"
                                        style={{
                                            background: 'var(--bg)',
                                            border: '1px solid var(--border)',
                                            color: 'var(--text)',
                                        }}
                                    />
                                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                        Plan will prioritize concepts in these subjects.
                                    </span>
                                </label>
                            </div>
                            {activePlan && loadStudyTrackerWeeklyGoalHours() != null && loadStudyTrackerWeeklyGoalHours() !== activePlan.hours_per_week && (
                                <button
                                    type="button"
                                    onClick={handleUpdatePlanToStudyTrackerHours}
                                    disabled={isSavingPlan}
                                    className="w-full text-xs px-3 py-2 rounded-lg font-medium border"
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        borderColor: 'var(--primary)',
                                        color: 'var(--primary)',
                                    }}
                                >
                                    Update plan to {loadStudyTrackerWeeklyGoalHours()} h/week (Study Tracker goal)
                                </button>
                            )}
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    className="text-xs px-3 py-1.5 rounded-lg"
                                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                                    onClick={() => setIsPlanModalOpen(false)}
                                    disabled={isSavingPlan}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreatePlan}
                                    disabled={isSavingPlan || planHoursPerWeek <= 0}
                                    className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-60"
                                    style={{ background: 'var(--gradient-primary)', color: '#fff' }}
                                >
                                    {isSavingPlan ? 'Creating…' : activePlan ? 'Regenerate plan' : 'Create plan'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default RoadmapPage;
