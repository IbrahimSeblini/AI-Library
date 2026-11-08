import React, { useMemo, useRef, useState } from 'react';
import { Highlight } from '../types';
import { createHighlight, deleteHighlight } from '../services/apiService';
import { HIGHLIGHT_COLOR_CONFIG, HIGHLIGHT_COLOR_ORDER, type HighlightColor } from '../lib/highlightColors';
import { buildParagraphSegments } from '../services/textChunker';

export interface ReaderSelection {
  text: string;
  startOffset: number;
  endOffset: number;
  paragraphIndex: number | null;
}

interface HighlightableTextProps {
  text: string;
  paperId: string;
  highlights: Highlight[];
  onHighlightsChange: () => void;
  onSelectionChange?: (selection: ReaderSelection | null) => void;
  activeParagraphIndex?: number | null;
}

const colorClasses = Object.fromEntries(
  HIGHLIGHT_COLOR_ORDER.map((color) => [color, HIGHLIGHT_COLOR_CONFIG[color].text])
) as Record<HighlightColor, string>;

const HighlightableText: React.FC<HighlightableTextProps> = ({
  text,
  paperId,
  highlights,
  onHighlightsChange,
  onSelectionChange,
  activeParagraphIndex = null,
}) => {
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionStart, setSelectionStart] = useState<number>(-1);
  const [selectionEnd, setSelectionEnd] = useState<number>(-1);
  const [selectedParagraphIndex, setSelectedParagraphIndex] = useState<number | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorPickerPosition, setColorPickerPosition] = useState({ x: 0, y: 0 });
  const textRef = useRef<HTMLDivElement>(null);
  const paragraphs = useMemo(() => buildParagraphSegments(text), [text]);

  const findParagraphIndex = (offset: number) => {
    const paragraph = paragraphs.find((segment) => offset >= segment.startOffset && offset <= segment.endOffset);
    return paragraph?.paragraphIndex ?? null;
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setSelectedText('');
      setShowColorPicker(false);
      setSelectedParagraphIndex(null);
      onSelectionChange?.(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedTextContent = selection.toString().trim();
    
    if (selectedTextContent.length === 0) {
      setSelectedText('');
      setShowColorPicker(false);
      setSelectedParagraphIndex(null);
      onSelectionChange?.(null);
      return;
    }

    // Get position relative to the text container
    const rect = range.getBoundingClientRect();
    const containerRect = textRef.current?.getBoundingClientRect();
    
    if (containerRect) {
      setColorPickerPosition({
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top - 40
      });
    }

    // Calculate offsets in the full text
    // IMPORTANT: Always calculate from the rendered DOM, then verify against original text
    if (textRef.current) {
      // Get the full rendered text content (textContent ignores HTML tags)
      const renderedText = textRef.current.textContent || '';
      
      // Verify rendered text matches original text (they should be identical)
      if (renderedText !== text) {
        console.warn('Rendered text does not match original text!', {
          renderedLength: renderedText.length,
          originalLength: text.length,
          difference: renderedText.length - text.length
        });
      }
      
      // Use range-based calculation to count text characters (ignoring HTML)
      const preCaretRange = document.createRange();
      preCaretRange.selectNodeContents(textRef.current);
      preCaretRange.setEnd(range.startContainer, range.startOffset);
      const startOffset = preCaretRange.toString().length;
      
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      const endOffset = preCaretRange.toString().length;
      
      // Verify the calculated offsets match the selected text in the ORIGINAL text
      const calculatedTextFromOriginal = text.substring(startOffset, endOffset);
      const selectedTextTrimmed = selectedTextContent.trim();
      const calculatedTextTrimmed = calculatedTextFromOriginal.trim();
      
      if (calculatedTextTrimmed !== selectedTextTrimmed && selectedTextTrimmed.length > 0) {
        // If there's a mismatch, try to find the text in the original text
        const searchText = selectedTextTrimmed;
        const searchIndex = text.indexOf(searchText, Math.max(0, startOffset - 100));
        if (searchIndex !== -1 && Math.abs(searchIndex - startOffset) < 100) {
          // Use the found position if it's close to our calculation
          console.log('Offset mismatch detected, using search fallback', {
            calculated: startOffset,
            found: searchIndex,
            difference: searchIndex - startOffset
          });
          setSelectionStart(searchIndex);
          setSelectionEnd(searchIndex + searchText.length);
          setSelectedText(selectedTextContent);
          const paragraphIndex = findParagraphIndex(searchIndex);
          setSelectedParagraphIndex(paragraphIndex);
          onSelectionChange?.({
            text: selectedTextContent,
            startOffset: searchIndex,
            endOffset: searchIndex + searchText.length,
            paragraphIndex,
          });
          setShowColorPicker(true);
          return;
        } else {
          console.warn('Could not find selected text in original text', {
            selectedText: searchText,
            calculatedOffset: startOffset,
            calculatedText: calculatedTextFromOriginal
          });
        }
      }

      // Verify offsets are within bounds
      if (startOffset < 0 || endOffset > text.length || startOffset >= endOffset) {
        console.error('Invalid offsets calculated', { startOffset, endOffset, textLength: text.length });
        return;
      }

      setSelectionStart(startOffset);
      setSelectionEnd(endOffset);
      setSelectedText(selectedTextContent);
      const paragraphIndex = findParagraphIndex(startOffset);
      setSelectedParagraphIndex(paragraphIndex);
      onSelectionChange?.({
        text: selectedTextContent,
        startOffset,
        endOffset,
        paragraphIndex,
      });
      setShowColorPicker(true);
    }
  };

  const handleCreateHighlight = async (color: HighlightColor) => {
    if (!selectedText || selectionStart === -1 || selectionEnd === -1) return;

    try {
      // Get context (50 chars before and after)
      const contextBefore = text.substring(Math.max(0, selectionStart - 50), selectionStart);
      const contextAfter = text.substring(selectionEnd, Math.min(text.length, selectionEnd + 50));

      await createHighlight({
        paper_id: parseInt(paperId),
        color,
        highlighted_text: selectedText,
        start_offset: selectionStart,
        end_offset: selectionEnd,
        context_before: contextBefore || undefined,
        context_after: contextAfter || undefined,
      });

      // Clear selection
      window.getSelection()?.removeAllRanges();
      setSelectedText('');
      setShowColorPicker(false);
      onHighlightsChange();
    } catch (error) {
      console.error('Failed to create highlight', error);
      alert('Failed to create highlight');
    }
  };

  const handleDeleteHighlight = async (highlightId: number) => {
    try {
      await deleteHighlight(highlightId);
      onHighlightsChange();
    } catch (error) {
      console.error('Failed to delete highlight', error);
      alert('Failed to delete highlight');
    }
  };

  const renderParagraph = (paragraphText: string, paragraphStartOffset: number, paragraphEndOffset: number) => {
    const validHighlights = highlights.filter((highlight) => {
      const valid =
        highlight.start_offset >= 0 &&
        highlight.end_offset <= text.length &&
        highlight.start_offset < highlight.end_offset &&
        highlight.start_offset < paragraphEndOffset &&
        highlight.end_offset > paragraphStartOffset;
      if (!valid && highlight.start_offset < highlight.end_offset && highlight.end_offset <= text.length) {
        return false;
      }
      return valid;
    });

    if (validHighlights.length === 0) {
      return paragraphText;
    }

    type Segment = {
      start: number;
      end: number;
      highlights: Highlight[];
    };

    const breakpoints = new Set<number>([paragraphStartOffset, paragraphEndOffset]);
    validHighlights.forEach((highlight) => {
      breakpoints.add(Math.max(paragraphStartOffset, highlight.start_offset));
      breakpoints.add(Math.min(paragraphEndOffset, highlight.end_offset));
    });

    const sortedBreakpoints = Array.from(breakpoints).sort((a, b) => a - b);
    const segments: Segment[] = [];
    for (let index = 0; index < sortedBreakpoints.length - 1; index += 1) {
      const start = sortedBreakpoints[index];
      const end = sortedBreakpoints[index + 1];
      if (start === end) continue;
      const segmentHighlights = validHighlights
        .filter((highlight) => highlight.start_offset < end && highlight.end_offset > start)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      segments.push({ start, end, highlights: segmentHighlights });
    }

    return (
      <>
        {segments.map((segment, index) => {
          const segmentText = text.slice(segment.start, segment.end);
          if (segment.highlights.length === 0) {
            return <React.Fragment key={`plain-${paragraphStartOffset}-${index}`}>{segmentText}</React.Fragment>;
          }
          const topHighlight = segment.highlights[0];
          return (
            <span
              key={`highlight-${topHighlight.id}-${paragraphStartOffset}-${index}`}
              data-highlight-id={topHighlight.id}
              className={`${colorClasses[topHighlight.color]} cursor-pointer relative group px-1.5 py-0.5 rounded border border-[var(--text)]/10`}
              style={{ position: 'relative', zIndex: segment.highlights.length }}
              title={`${topHighlight.color} highlight - Click to delete`}
              onClick={(event) => {
                event.stopPropagation();
                handleDeleteHighlight(topHighlight.id);
              }}
            >
              {segmentText}
              <span className="absolute -top-7 left-0 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-xs px-2 py-1 rounded-lg shadow-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                Click to delete
              </span>
            </span>
          );
        })}
      </>
    );
  };

  return (
    <div className="relative">
      <div
        ref={textRef}
        onMouseUp={handleTextSelection}
        className="select-text"
        style={{ userSelect: 'text' }}
      >
        <div className="space-y-5">
          {paragraphs.map((paragraph) => (
            <p
              key={paragraph.id}
              id={`paper-paragraph-${paragraph.paragraphIndex}`}
              data-paragraph-index={paragraph.paragraphIndex}
              className={`rounded-2xl px-3 py-2 transition-colors ${activeParagraphIndex === paragraph.paragraphIndex ? 'bg-[var(--primary-light)]/80 ring-1 ring-[var(--primary)]/35' : 'bg-transparent'}`}
            >
              {renderParagraph(paragraph.text, paragraph.startOffset, paragraph.endOffset)}
            </p>
          ))}
        </div>
      </div>

      {showColorPicker && selectedText && (
        <div
          className="absolute z-50 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl"
          style={{
            left: `${colorPickerPosition.x}px`,
            top: `${colorPickerPosition.y}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Highlight color
          </div>
          {selectedParagraphIndex !== null && (
            <div className="mb-3 text-xs text-[var(--text-muted)]">
              Paragraph {selectedParagraphIndex + 1}
            </div>
          )}
          <div className="grid grid-cols-5 gap-2">
            {HIGHLIGHT_COLOR_ORDER.map((color) => (
              <button
                key={color}
                onClick={() => handleCreateHighlight(color)}
                className={`h-10 w-10 rounded-xl border border-white/40 ${HIGHLIGHT_COLOR_CONFIG[color].swatch} transition-transform hover:-translate-y-0.5 hover:ring-2 ${HIGHLIGHT_COLOR_CONFIG[color].ring}`}
                title={HIGHLIGHT_COLOR_CONFIG[color].name}
              >
                <span className="sr-only">{HIGHLIGHT_COLOR_CONFIG[color].name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HighlightableText;
