import React from 'react';

// Represents summarizing — lines narrowing to a point (condensing)
export const FileListIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="5" y1="10" x2="19" y2="10" />
    <line x1="7" y1="14" x2="17" y2="14" />
    <line x1="9" y1="18" x2="15" y2="18" />
  </svg>
);
