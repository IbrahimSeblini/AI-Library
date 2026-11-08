import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MasteryState } from '../../types';

export interface PaperNodeData {
    paper_id: number;
    title: string;
    mastery_state: MasteryState;
    concept_count: number;
    subject_cluster: string;
    filtered: boolean;
    animIndex: number;
}

export const PAPER_NODE_WIDTH = 200;
export const PAPER_NODE_HEIGHT = 72;

const MASTERY_COLOR: Record<MasteryState, string> = {
    1: '#94a3b8',
    2: 'var(--primary)',
    3: 'var(--primary)',
    4: 'var(--warning)',
};

const MASTERY_BG: Record<MasteryState, string> = {
    1: 'transparent',
    2: 'rgba(99,102,241,0.05)',
    3: 'rgba(99,102,241,0.09)',
    4: 'rgba(245,158,11,0.05)',
};

const MASTERY_LABEL: Record<MasteryState, string> = {
    1: 'Discovered',
    2: 'Reading',
    3: 'Engaged',
    4: 'Mastered',
};

const PaperNode: React.FC<NodeProps<PaperNodeData>> = ({ data, selected }) => {
    const color = MASTERY_COLOR[data.mastery_state];
    const delay = (data.animIndex * 0.05).toFixed(3);

    return (
        <div
            style={{
                width: PAPER_NODE_WIDTH,
                height: PAPER_NODE_HEIGHT,
                opacity: data.filtered ? 0.14 : 1,
                animation: `rfNodeIn 0.4s ease ${delay}s both`,
                transition: 'opacity 0.3s ease',
            }}
        >
            <Handle type="target" position={Position.Top}   style={{ opacity: 0, width: 8, height: 8 }} />
            <Handle type="target" position={Position.Left}  style={{ opacity: 0, width: 8, height: 8 }} />

            <div
                style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 10,
                    background: selected
                        ? MASTERY_BG[data.mastery_state]
                        : 'var(--surface)',
                    border: selected
                        ? `2px solid ${color}`
                        : `1px solid ${data.mastery_state >= 2 ? color + '55' : 'var(--border)'}`,
                    boxShadow: selected
                        ? `0 0 0 3px ${color}22, var(--shadow-md)`
                        : data.mastery_state === 4
                        ? '0 0 14px rgba(245,158,11,0.18)'
                        : 'var(--shadow-sm)',
                    display: 'flex',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'border 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
                }}
            >
                {/* Left mastery bar */}
                <div
                    style={{
                        width: 4,
                        background: color,
                        flexShrink: 0,
                        opacity: data.mastery_state === 1 ? 0.4 : 1,
                        transition: 'background 0.3s ease',
                    }}
                />

                {/* Main content */}
                <div
                    style={{
                        flex: 1,
                        padding: '9px 10px 7px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minWidth: 0,
                        gap: 4,
                    }}
                >
                    <div
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--text)',
                            lineHeight: 1.3,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            wordBreak: 'break-word',
                        }}
                        title={data.title}
                    >
                        {data.title}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span
                            style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: color,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}
                        >
                            {MASTERY_LABEL[data.mastery_state]}
                        </span>
                        <span style={{ color: 'var(--border)', fontSize: 9 }}>·</span>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                            {data.concept_count} concept{data.concept_count !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
            </div>

            <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 8, height: 8 }} />
            <Handle type="source" position={Position.Right}  style={{ opacity: 0, width: 8, height: 8 }} />
        </div>
    );
};

export default memo(PaperNode);
