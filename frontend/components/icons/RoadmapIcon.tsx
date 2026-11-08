import React from 'react';

interface Props { className?: string }

// Triangle node-graph: 2 nodes at bottom, 1 at top, connected by 3 edges
const RoadmapIcon: React.FC<Props> = ({ className }) => (
    <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        {/* Top node */}
        <circle cx="10" cy="3.5" r="2" />
        {/* Bottom-left node */}
        <circle cx="3.5" cy="15" r="2" />
        {/* Bottom-right node */}
        <circle cx="16.5" cy="15" r="2" />
        {/* Edges */}
        <line x1="10" y1="5.5" x2="4.8" y2="13.2" />
        <line x1="10" y1="5.5" x2="15.2" y2="13.2" />
        <line x1="5.5" y1="15" x2="14.5" y2="15" />
    </svg>
);

export default RoadmapIcon;
