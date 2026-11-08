import React, { useEffect } from 'react';
import type { ParagraphSegment, SpeechPosition } from '../types';

interface ReadAloudReaderProps {
  paragraphs: ParagraphSegment[];
  currentPosition: SpeechPosition;
  onJumpTo?: (position: SpeechPosition) => void;
}

const ReadAloudReader: React.FC<ReadAloudReaderProps> = ({ paragraphs, currentPosition, onJumpTo }) => {
  useEffect(() => {
    const element = document.getElementById(`ra-sent-${currentPosition.paragraphIndex}-${currentPosition.sentenceIndex}`);
    if (element) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [currentPosition]);

  if (!paragraphs.length) {
    return <p className="text-[var(--text-muted)]">No readable text available.</p>;
  }

  return (
    <div className="space-y-4">
      {paragraphs.map((paragraph) => (
        <p key={paragraph.id} className="text-[var(--text)] leading-relaxed">
          {paragraph.sentences.map((sentence) => {
            const isActive =
              sentence.paragraphIndex === currentPosition.paragraphIndex &&
              sentence.sentenceIndex === currentPosition.sentenceIndex;
            return (
              <span
                key={sentence.id}
                id={`ra-sent-${sentence.paragraphIndex}-${sentence.sentenceIndex}`}
                role={onJumpTo ? 'button' : undefined}
                tabIndex={onJumpTo ? 0 : -1}
                aria-label={onJumpTo ? 'Jump to sentence' : undefined}
                onClick={onJumpTo ? () => onJumpTo({
                  paragraphIndex: sentence.paragraphIndex,
                  sentenceIndex: sentence.sentenceIndex,
                }) : undefined}
                onKeyDown={
                  onJumpTo
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onJumpTo({
                            paragraphIndex: sentence.paragraphIndex,
                            sentenceIndex: sentence.sentenceIndex,
                          });
                        }
                      }
                    : undefined
                }
                className={`transition-colors rounded px-1 ${
                  isActive ? 'bg-[var(--primary)]/30 text-[var(--text)]' : 'hover:bg-[var(--bg-secondary)]/60'
                } ${onJumpTo ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary)]' : ''}`}
              >
                {sentence.text}{' '}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
};

export default ReadAloudReader;
