import React, { memo, useState } from 'react';
import { EdgeProps, getBezierPath, EdgeLabelRenderer } from 'reactflow';

export interface ConceptEdgeData {
    label: string;
    mastered?: boolean; // animated dash if source or target is mastered
    filtered?: boolean;
}

const ConceptEdge: React.FC<EdgeProps<ConceptEdgeData>> = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
}) => {
    const [hovered, setHovered] = useState(false);

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const filtered = data?.filtered ?? false;
    const mastered = data?.mastered ?? false;
    const opacity = filtered ? 0.04 : hovered ? 0.85 : mastered ? 0.55 : 0.35;

    return (
        <>
            {/* Invisible wide path for easier hover detection */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{ cursor: 'pointer' }}
            />

            {/* Visible edge */}
            <path
                id={id}
                className="react-flow__edge-path"
                d={edgePath}
                markerEnd={markerEnd}
                fill="none"
                stroke={mastered ? 'var(--warning)' : 'var(--primary)'}
                strokeWidth={hovered ? 2 : 1.5}
                strokeOpacity={opacity}
                strokeDasharray={mastered ? '7 4' : undefined}
                style={{
                    transition: 'stroke-opacity 0.2s ease, stroke-width 0.2s ease',
                    animation: mastered ? 'edgeDash 1.5s linear infinite' : undefined,
                }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            />

            {/* Label pill — visible only on hover */}
            {hovered && data?.label && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'none',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 9999,
                            padding: '2px 9px',
                            fontSize: 10,
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            letterSpacing: '0.04em',
                            whiteSpace: 'nowrap',
                            boxShadow: 'var(--shadow-sm)',
                            backdropFilter: 'blur(8px)',
                        }}
                    >
                        {data.label}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};

export default memo(ConceptEdge);
