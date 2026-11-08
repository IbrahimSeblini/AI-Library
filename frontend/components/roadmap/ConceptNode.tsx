import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MasteryState } from '../../types';

export interface ConceptNodeData {
    name: string;
    type: string;
    description: string;
    importance: number;      // 1-5
    mastery_state: MasteryState;
    paper_ids: number[];
    paper_titles: Record<string, string>;
    subject_cluster: string;
    filtered: boolean;       // true = dimmed (subject filter active)
    animIndex: number;       // for stagger animation
    upgrading?: boolean;     // true = briefly animate state upgrade
}

// Diameter in px: importance 1→44, 2→52, 3→60, 4→68, 5→76
export const getConceptNodeSize = (imp: number): number => {
    const sizes: Record<number, number> = { 1: 44, 2: 52, 3: 60, 4: 68, 5: 76 };
    return sizes[Math.min(5, Math.max(1, imp))] ?? 60;
};

const STATE: Record<
    MasteryState,
    { bg: string; border: string; color: string; shadow: string }
> = {
    1: {
        bg: 'transparent',
        border: '2px solid #94a3b8',
        color: '#94a3b8',
        shadow: 'none',
    },
    2: {
        bg: '#ffffff',
        border: '2px solid var(--primary)',
        color: 'var(--primary)',
        shadow: 'var(--glow-primary)',
    },
    3: {
        bg: 'var(--primary)',
        border: '2px solid var(--primary)',
        color: '#ffffff',
        shadow: 'var(--glow-primary)',
    },
    4: {
        bg: 'var(--gradient-primary)',
        border: '2.5px solid var(--warning)',
        color: '#ffffff',
        shadow: 'var(--glow-strong)',
    },
};

const MASTERY_LABEL: Record<MasteryState, string> = {
    1: 'Discovered',
    2: 'Reading',
    3: 'Engaged',
    4: 'Mastered',
};

const ConceptNode: React.FC<NodeProps<ConceptNodeData>> = ({ data, selected }) => {
    const size = getConceptNodeSize(data.importance);
    const s = STATE[data.mastery_state] ?? STATE[1];
    const delay = data.animIndex * 0.02;

    return (
        // Wrapper: only the circle size — label is absolutely positioned below
        <div
            style={{
                width: size,
                height: size,
                opacity: data.filtered ? 0.12 : 1,
                transition: 'opacity 0.3s ease',
                animation: data.upgrading
                    ? 'rfNodeUpgrade 0.7s ease both'
                    : `rfNodeIn 0.4s ease ${delay.toFixed(3)}s both`,
                position: 'relative',
            }}
        >
            {/* Target handle — top (TB layout) */}
            <Handle
                type="target"
                position={Position.Top}
                style={{ opacity: 0, width: 4, height: 4 }}
            />

            {/* Circle */}
            <div
                style={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    background: s.bg,
                    border: selected ? '3px solid var(--warning)' : s.border,
                    boxShadow: selected
                        ? `${s.shadow}, 0 0 0 4px color-mix(in srgb, var(--warning) 30%, transparent)`
                        : s.shadow,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    flexShrink: 0,
                    transition: 'box-shadow 0.2s ease, border 0.2s ease, transform 0.2s ease',
                    transform: selected ? 'scale(1.12)' : 'scale(1)',
                    cursor: 'pointer',
                }}
            >
                {/* Gold star badge — mastered only */}
                {data.mastery_state === 4 && (
                    <div
                        style={{
                            position: 'absolute',
                            top: -7,
                            right: -7,
                            width: 17,
                            height: 17,
                            borderRadius: '50%',
                            background: 'var(--warning)',
                            border: '1.5px solid var(--warning-light)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
                            color: '#fff',
                            fontWeight: 800,
                            pointerEvents: 'none',
                            boxShadow: '0 0 6px rgba(245,158,11,0.6)',
                        }}
                    >
                        ★
                    </div>
                )}
            </div>

            {/* Label — absolutely positioned BELOW the circle, outside node bounds */}
            <div
                style={{
                    position: 'absolute',
                    top: size + 7,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: Math.max(size + 28, 88),
                    textAlign: 'center',
                    fontSize: 10.5,
                    fontWeight: data.mastery_state >= 3 ? 600 : 400,
                    color: data.mastery_state >= 3 ? 'var(--text)' : 'var(--text-muted)',
                    lineHeight: 1.25,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    pointerEvents: 'none',
                    letterSpacing: '-0.01em',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                }}
                title={`${data.name} · ${MASTERY_LABEL[data.mastery_state]}`}
            >
                {data.name}
            </div>

            {/* Source handle — bottom (TB layout) */}
            <Handle
                type="source"
                position={Position.Bottom}
                style={{ opacity: 0, width: 4, height: 4 }}
            />
        </div>
    );
};

export default memo(ConceptNode);
