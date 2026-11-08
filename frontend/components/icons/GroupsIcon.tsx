import React from 'react';

// Three people side-by-side — clearly a group/team, nothing like a node graph
export const GroupsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Center person — slightly larger */}
    <circle cx="12" cy="7" r="3" />
    <path d="M6 21v-2a6 6 0 0 1 12 0v2" />
    {/* Left person — smaller, partially behind */}
    <circle cx="4.5" cy="9" r="2" />
    <path d="M2 21v-1a4 4 0 0 1 4.5-3.96" />
    {/* Right person — smaller, partially behind */}
    <circle cx="19.5" cy="9" r="2" />
    <path d="M22 21v-1a4 4 0 0 0-4.5-3.96" />
  </svg>
);
