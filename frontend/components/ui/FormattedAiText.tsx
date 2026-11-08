import React from 'react';

interface FormattedAiTextProps {
  text: string;
  className?: string;
}

function renderInline(text: string): React.ReactNode[] {
  const cleaned = text.replace(/\r/g, '').replace(/\t/g, '  ').replace(/\\n/g, '\n');
  const parts = cleaned.split(/(\[S\d+\]|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*)/g).filter(Boolean);

  return parts.map((part, index) => {
    const citationMatch = part.match(/^\[(S\d+)\]$/);
    if (citationMatch) {
      return (
        <sup
          key={index}
          className="ml-1 inline-flex rounded-full border border-[var(--border)] bg-[var(--primary-light)] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--primary)]"
        >
          {citationMatch[1]}
        </sup>
      );
    }
    const boldMatch = part.match(/^(?:\*\*([^*]+)\*\*|__([^_]+)__)$/);
    if (boldMatch) {
      return (
        <strong key={index} className="font-semibold">
          {boldMatch[1] || boldMatch[2]}
        </strong>
      );
    }
    const italicMatch = part.match(/^\*([^*\n]+)\*$/);
    if (italicMatch) {
      return (
        <em key={index} className="italic">
          {italicMatch[1]}
        </em>
      );
    }
    return <React.Fragment key={index}>{part.replace(/\*\*/g, '').replace(/__/g, '')}</React.Fragment>;
  });
}

const FormattedAiText: React.FC<FormattedAiTextProps> = ({ text, className = '' }) => {
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, index, arr) => line !== '' || (index > 0 && arr[index - 1] !== ''));

  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: 'ordered' | 'unordered' | null = null;

  const flushList = () => {
    if (listItems.length === 0 || !listType) return;
    const Tag = listType === 'ordered' ? 'ol' : 'ul';
    const classes = listType === 'ordered' ? 'list-decimal pl-6 space-y-2' : 'list-disc pl-6 space-y-2';
    nodes.push(<Tag key={`list-${nodes.length}`} className={classes}>{listItems}</Tag>);
    listItems = [];
    listType = null;
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      nodes.push(<div key={`spacer-${index}`} className="h-3" />);
      return;
    }

    const numberedMatch = line.match(/^\d+[\.\)]\s+(.*)$/);
    if (numberedMatch) {
      if (listType && listType !== 'ordered') flushList();
      listType = 'ordered';
      listItems.push(
        <li key={`item-${index}`} className="leading-relaxed">
          {renderInline(numberedMatch[1])}
        </li>
      );
      return;
    }

    const bulletMatch = line.match(/^(?:[-*•])\s+(.*)$/);
    if (bulletMatch) {
      if (listType && listType !== 'unordered') flushList();
      listType = 'unordered';
      listItems.push(
        <li key={`bullet-${index}`} className="leading-relaxed">
          {renderInline(bulletMatch[1])}
        </li>
      );
      return;
    }

    flushList();

    const headingMatch = line.match(/^\*\*(.+?)\*\*$/);
    if (headingMatch) {
      nodes.push(
        <p key={`heading-${index}`} className="font-semibold text-[1.02em]">
          {headingMatch[1].replace(/\*\*/g, '')}
        </p>
      );
      return;
    }

    const colonHeadingMatch = line.match(/^([A-Z][A-Za-z0-9\s/&'-]{1,50}):$/);
    if (colonHeadingMatch) {
      nodes.push(
        <p key={`heading-colon-${index}`} className="font-semibold text-[1.02em]">
          {colonHeadingMatch[1]}
        </p>
      );
      return;
    }

    nodes.push(
      <p key={`line-${index}`} className="leading-relaxed">
        {renderInline(line.replace(/^\*\s+/, ''))}
      </p>
    );
  });

  flushList();

  return <div className={`space-y-3 ${className}`}>{nodes}</div>;
};

export default FormattedAiText;
