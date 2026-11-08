import React, { useState, useEffect, useRef } from 'react';
import { Paper, GroupHighlight, GroupComment, User, PaperNotesSummary } from '../types';
import { getGroupPaperById, getGroupPaperHighlights, getGroupPaperComments, createGroupHighlight, deleteGroupHighlight, createGroupComment, updateGroupComment, deleteGroupComment } from '../services/apiService';
import { getPaperNotesSummary, regeneratePaperNotesSummary } from '../services/groupNotesService';
import { LoaderIcon } from './icons/LoaderIcon';
import { XIcon } from './icons/XIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { HIGHLIGHT_COLOR_CONFIG, HIGHLIGHT_COLOR_ORDER, type HighlightColor } from '../lib/highlightColors';
import AiTrustFooter from './ui/AiTrustFooter';

interface GroupDocumentViewerProps {
  groupId: string;
  paperId: string;
  user: User;
  onBack: () => void;
  onSummarize?: (text: string) => void;
  onParaphrase?: (text: string) => void;
}

const colorClasses = Object.fromEntries(
  HIGHLIGHT_COLOR_ORDER.map((color) => [color, HIGHLIGHT_COLOR_CONFIG[color].text])
) as Record<HighlightColor, string>;

type ReaderSideTab = 'summary' | 'highlights' | 'comments';

const GroupDocumentViewer: React.FC<GroupDocumentViewerProps> = ({ groupId, paperId, user, onBack, onSummarize, onParaphrase }) => {
  const [paper, setPaper] = useState<Paper | null>(null);
  const [highlights, setHighlights] = useState<GroupHighlight[]>([]);
  const [comments, setComments] = useState<GroupComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionStart, setSelectionStart] = useState<number>(-1);
  const [selectionEnd, setSelectionEnd] = useState<number>(-1);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [colorPickerPosition, setColorPickerPosition] = useState({ x: 0, y: 0 });
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [notesSummary, setNotesSummary] = useState<PaperNotesSummary | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [activeSideTab, setActiveSideTab] = useState<ReaderSideTab>('summary');
  const textRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [fetchedPaper, fetchedHighlights, fetchedComments] = await Promise.all([
        getGroupPaperById(groupId, paperId),
        getGroupPaperHighlights(groupId, paperId),
        getGroupPaperComments(groupId, paperId)
      ]);
      setPaper(fetchedPaper || null);
      setHighlights(fetchedHighlights);
      setComments(fetchedComments);
      const summary = await getPaperNotesSummary(groupId, paperId);
      setNotesSummary(summary);
    } catch (error) {
      console.error("Failed to fetch document data", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [groupId, paperId]);

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !paper) {
      setSelectedText('');
      setShowColorPicker(false);
      setShowCommentDialog(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedTextContent = selection.toString().trim();

    if (selectedTextContent.length === 0) {
      setSelectedText('');
      setShowColorPicker(false);
      setShowCommentDialog(false);
      return;
    }

    // Get bounding rect of the selection (viewport coordinates)
    const rect = range.getBoundingClientRect();

    // Position the picker below the selection, centered horizontally
    setColorPickerPosition({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 10
    });

    // Calculate offsets in the full text
    if (textRef.current && paper.fullText) {
      const renderedText = textRef.current.textContent || '';

      if (renderedText !== paper.fullText) {
        console.warn('Rendered text does not match raw text!', {
          renderedLength: renderedText.length,
          rawLength: paper.fullText.length,
          difference: renderedText.length - paper.fullText.length
        });
      }

      const preCaretRange = document.createRange();
      preCaretRange.selectNodeContents(textRef.current);
      preCaretRange.setEnd(range.startContainer, range.startOffset);
      const startOffset = preCaretRange.toString().length;

      preCaretRange.setEnd(range.endContainer, range.endOffset);
      const endOffset = preCaretRange.toString().length;

      const calculatedTextFromOriginal = paper.fullText.substring(startOffset, endOffset);
      const selectedTextTrimmed = selectedTextContent.trim();
      const calculatedTextTrimmed = calculatedTextFromOriginal.trim();

      if (calculatedTextTrimmed !== selectedTextTrimmed && selectedTextContent.trim().length > 0) {
        const searchText = selectedTextTrimmed;
        const searchIndex = paper.fullText.indexOf(searchText, Math.max(0, startOffset - 100));
        if (searchIndex !== -1 && Math.abs(searchIndex - startOffset) < 100) {
          setSelectionStart(searchIndex);
          setSelectionEnd(searchIndex + searchText.length);
          setSelectedText(selectedTextContent);
          setShowColorPicker(true);
          return;
        }
      }

      if (startOffset < 0 || endOffset > paper.fullText.length || startOffset >= endOffset) {
        console.error('Invalid offsets calculated', { startOffset, endOffset, textLength: paper.fullText.length });
        return;
      }

      setSelectionStart(startOffset);
      setSelectionEnd(endOffset);
      setSelectedText(selectedTextContent);
      setShowColorPicker(true);
    }
  };

  const handleCreateHighlight = async (color: HighlightColor) => {
    if (!selectedText || selectionStart === -1 || selectionEnd === -1 || !paper) return;

    try {
      const contextBefore = paper.fullText.substring(Math.max(0, selectionStart - 50), selectionStart);
      const contextAfter = paper.fullText.substring(selectionEnd, Math.min(paper.fullText.length, selectionEnd + 50));

      await createGroupHighlight(groupId, {
        paper_id: parseInt(paperId),
        color,
        highlighted_text: selectedText,
        start_offset: selectionStart,
        end_offset: selectionEnd,
        context_before: contextBefore || undefined,
        context_after: contextAfter || undefined,
      });

      window.getSelection()?.removeAllRanges();
      setSelectedText('');
      setShowColorPicker(false);
      fetchData();
    } catch (error) {
      console.error('Failed to create highlight', error);
      alert('Failed to create highlight');
    }
  };

  const handleDeleteHighlight = async (highlightId: number) => {
    try {
      await deleteGroupHighlight(groupId, highlightId);
      fetchData();
    } catch (error) {
      console.error('Failed to delete highlight', error);
      alert('Failed to delete highlight');
    }
  };

  const handleCreateComment = async () => {
    if (!selectedText || selectionStart === -1 || selectionEnd === -1 || !commentText.trim() || !paper) return;

    try {
      const contextBefore = paper.fullText.substring(Math.max(0, selectionStart - 50), selectionStart);
      const contextAfter = paper.fullText.substring(selectionEnd, Math.min(paper.fullText.length, selectionEnd + 50));

      await createGroupComment(groupId, {
        paper_id: parseInt(paperId),
        commented_text: selectedText,
        comment_text: commentText.trim(),
        start_offset: selectionStart,
        end_offset: selectionEnd,
        context_before: contextBefore || undefined,
        context_after: contextAfter || undefined,
      });

      window.getSelection()?.removeAllRanges();
      setSelectedText('');
      setCommentText('');
      setShowCommentDialog(false);
      fetchData();
    } catch (error) {
      console.error('Failed to create comment', error);
      alert('Failed to create comment');
    }
  };

  const handleUpdateComment = async (commentId: number) => {
    if (!editingCommentText.trim()) return;

    try {
      await updateGroupComment(groupId, commentId, editingCommentText.trim());
      setEditingCommentId(null);
      setEditingCommentText('');
      fetchData();
    } catch (error) {
      console.error('Failed to update comment', error);
      alert('Failed to update comment');
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      await deleteGroupComment(groupId, commentId);
      fetchData();
    } catch (error) {
      console.error('Failed to delete comment', error);
      alert('Failed to delete comment');
    }
  };

  const handleGenerateNotesSummary = async () => {
    setIsSummaryLoading(true);
    setSummaryError(null);
    try {
      const result = await regeneratePaperNotesSummary(groupId, paperId);
      setNotesSummary(result);
    } catch (error: any) {
      setSummaryError(error.message || 'Failed to generate summary');
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const renderTextWithHighlightsAndComments = () => {
    if (!paper) return null;

    const validHighlights = highlights.filter(h => {
      const valid = h.start_offset >= 0 &&
                    h.end_offset <= paper.fullText.length &&
                    h.start_offset < h.end_offset;
      if (!valid) console.error('Invalid highlight offsets', h);
      return valid;
    });

    const validComments = comments.filter(c => {
      const valid = c.start_offset >= 0 &&
                    c.end_offset <= paper.fullText.length &&
                    c.start_offset < c.end_offset;
      if (!valid) console.error('Invalid comment offsets', c);
      return valid;
    });

    const annotations: Array<{
      type: 'highlight' | 'comment';
      id: number;
      start: number;
      end: number;
      created_at: string;
      data: GroupHighlight | GroupComment;
    }> = [];

    validHighlights.forEach(h => {
      annotations.push({ type: 'highlight', id: h.id, start: h.start_offset, end: h.end_offset, created_at: h.created_at, data: h });
    });
    validComments.forEach(c => {
      annotations.push({ type: 'comment', id: c.id, start: c.start_offset, end: c.end_offset, created_at: c.created_at, data: c });
    });

    annotations.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    type Segment = {
      start: number;
      end: number;
      annotations: Array<{ type: 'highlight' | 'comment'; data: GroupHighlight | GroupComment }>;
    };

    const segments: Segment[] = [];
    const breakpoints = new Set<number>();
    annotations.forEach(ann => { breakpoints.add(ann.start); breakpoints.add(ann.end); });

    const sortedBreakpoints = Array.from(breakpoints).sort((a, b) => a - b);
    let currentStart = 0;

    for (let i = 0; i < sortedBreakpoints.length; i++) {
      const end = sortedBreakpoints[i];
      if (currentStart < end) {
        const segmentAnnotations = annotations
          .filter(ann => ann.start < end && ann.end > currentStart)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        segments.push({ start: currentStart, end, annotations: segmentAnnotations.map(ann => ({ type: ann.type, data: ann.data })) });
      }
      currentStart = end;
    }

    if (currentStart < paper.fullText.length) {
      const segmentAnnotations = annotations
        .filter(ann => ann.start < paper.fullText.length && ann.end > currentStart)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      segments.push({ start: currentStart, end: paper.fullText.length, annotations: segmentAnnotations.map(ann => ({ type: ann.type, data: ann.data })) });
    }

    const parts: Array<{ text: string; highlight?: GroupHighlight; comment?: GroupComment; zIndex?: number }> = [];
    segments.forEach((segment) => {
      const segmentText = paper.fullText.substring(segment.start, segment.end);
      if (segment.annotations.length === 0) {
        parts.push({ text: segmentText });
      } else {
        const topAnnotation = segment.annotations[0];
        if (topAnnotation.type === 'highlight') {
          parts.push({ text: segmentText, highlight: topAnnotation.data as GroupHighlight, zIndex: segment.annotations.length });
        } else {
          parts.push({ text: segmentText, comment: topAnnotation.data as GroupComment, zIndex: segment.annotations.length });
        }
      }
    });

    return (
      <>
        {parts.map((part, index) => {
          if (part.highlight) {
            const h = part.highlight;
            const canDelete = h.user_id === parseInt(user.id);
            return (
              <span
                key={`highlight-${h.id}-${index}`}
                className={`${colorClasses[h.color]} cursor-pointer relative group px-1 rounded`}
                style={{ position: 'relative', zIndex: part.zIndex || 1 }}
                title={`${h.color} highlight by ${h.user_name || 'Unknown'}`}
                onClick={(e) => {
                  if (canDelete && e.detail === 2) handleDeleteHighlight(h.id);
                }}
              >
                {part.text}
                <span className="absolute -top-7 left-0 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-xs px-2 py-1 rounded-lg shadow-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                  {h.user_name || 'Unknown'}{canDelete ? ' - Double-click to delete' : ''}
                </span>
              </span>
            );
          }
          if (part.comment) {
            const c = part.comment;
            return (
              <span
                key={`comment-${c.id}-${index}`}
                className="bg-indigo-200 text-indigo-900 cursor-pointer relative group px-1 rounded border-b-2 border-indigo-500"
                style={{ position: 'relative', zIndex: part.zIndex || 1 }}
                title={`Comment by ${c.user_name || 'Unknown'}`}
              >
                {part.text}
                <span className="absolute -top-7 left-0 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-xs px-2 py-1 rounded-lg shadow-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                  {c.user_name || 'Unknown'} - Comment
                </span>
              </span>
            );
          }
          return <React.Fragment key={index}>{part.text}</React.Fragment>;
        })}
      </>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-4rem)]">
        <LoaderIcon className="w-12 h-12 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-400">Document not found</h2>
        <button onClick={onBack} className="mt-6 text-white font-bold py-2 px-4 rounded-lg" style={{ background: 'var(--gradient-primary)' }}>
          Go Back
        </button>
      </div>
    );
  }

  const sortedHighlights = [...highlights].sort((a, b) => a.start_offset - b.start_offset);
  const sortedComments = [...comments].sort((a, b) => a.start_offset - b.start_offset);
  const inputClass = "w-full bg-[var(--bg-secondary)] text-[var(--text)] p-2 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]";

  return (
    <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-8">
      <button onClick={onBack} className="mb-8 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]">
        &larr; Back to Group
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-12">
        {/* Main Document Area */}
        <main className="min-w-0">
          <span className="mb-4 inline-block rounded-md px-3 py-1 text-xs font-semibold text-white" style={{ background: 'var(--gradient-primary)' }}>
            {paper.subject}
          </span>

          <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display">
            {paper.title}
          </h1>

          <p className="mt-4 text-lg text-[var(--text-muted)]">
            By {paper.authors.join(", ")} - {paper.publicationYear}
          </p>

          <section className="mt-8 border-t border-[var(--border)] pt-8">
            <h2 className="text-2xl font-bold text-[var(--text)] font-display mb-2">Summary</h2>
            <p className="text-[var(--text)] leading-relaxed">{paper.summary}</p>
          </section>

          <section className="mt-8 border-t border-[var(--border)] pt-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-2xl font-bold text-[var(--text)] font-display">Full Text</h2>
              <div className="flex items-center gap-3">
                {onSummarize && paper.fullText && (
                  <button
                    onClick={() => onSummarize(paper.fullText)}
                    className="inline-flex items-center gap-2 text-white font-semibold py-2 px-4 rounded-md transition-opacity hover:opacity-90"
                    style={{ background: 'var(--gradient-primary)' }}
                  >
                    <SparklesIcon className="w-5 h-5" />
                    Summarize
                  </button>
                )}
                {onParaphrase && paper.fullText && (
                  <button
                    onClick={() => onParaphrase(paper.fullText)}
                    className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text)] font-semibold py-2 px-2 transition-colors"
                  >
                    <SparklesIcon className="w-5 h-5" />
                    Paraphrase
                  </button>
                )}
                <div className="text-sm text-[var(--text-muted)]">
                  Select text to highlight or comment
                </div>
              </div>
            </div>
            <div
              ref={textRef}
              onMouseUp={handleTextSelection}
              className="min-h-[400px] border-l border-[var(--border)] py-1 pl-5 text-[var(--text)] leading-relaxed whitespace-pre-wrap"
              style={{ userSelect: 'text' }}
            >
              {renderTextWithHighlightsAndComments()}
            </div>
          </section>
        </main>

        {/* Side Panel */}
        <aside className="lg:sticky lg:top-24 lg:self-start lg:border-l lg:border-[var(--border)] lg:pl-6">
          <div>
            <div className="border-b border-[var(--border)] pb-4">
              <h3 className="text-lg font-bold text-[var(--text)] font-display">Group notes</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Summary, highlights, and comments for this paper.</p>
            </div>

            <div className="flex border-b border-[var(--border)]">
              {([
                ['summary', 'Summary', null],
                ['highlights', 'Highlights', highlights.length],
                ['comments', 'Comments', comments.length],
              ] as Array<[ReaderSideTab, string, number | null]>).map(([id, label, count]) => (
                <button
                  key={id}
                  onClick={() => setActiveSideTab(id)}
                  className={`border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                    activeSideTab === id
                      ? 'border-[var(--primary)] text-[var(--primary)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {label}{count !== null ? ` ${count}` : ''}
                </button>
              ))}
            </div>

            <div className="max-h-[calc(100vh-16rem)] overflow-y-auto pt-5">
              {activeSideTab === 'summary' && (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <SparklesIcon className="h-5 w-5 text-[var(--primary)]" />
                    <h4 className="font-bold text-[var(--text)]">Notes Summary</h4>
                  </div>

                  {isSummaryLoading && (
                    <div className="flex items-center gap-3 text-[var(--text-muted)]">
                      <LoaderIcon className="h-5 w-5 animate-spin text-[var(--primary)]" />
                      <span className="text-sm">Analyzing notes with AI...</span>
                    </div>
                  )}

                  {summaryError && !isSummaryLoading && (
                    <p className="text-sm text-red-400">{summaryError}</p>
                  )}

                  {notesSummary && !isSummaryLoading && (
                    <>
                      {notesSummary.available ? (
                        <div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">{notesSummary.summary}</p>
                          <AiTrustFooter
                            feature="paper-notes-summary"
                            contextId={`group:${groupId}:paper:${paperId}`}
                            source={`Generated from ${notesSummary.meaningful_highlight_count} highlight${notesSummary.meaningful_highlight_count !== 1 ? 's' : ''} and ${notesSummary.meaningful_comment_count} comment${notesSummary.meaningful_comment_count !== 1 ? 's' : ''}`}
                            timestamp={notesSummary.generated_at}
                            onRegenerate={handleGenerateNotesSummary}
                            regenerateLabel="Regenerate"
                            metadata={{ group_id: groupId, paper_id: paperId }}
                            compact
                          />
                        </div>
                      ) : (
                        <p className="rounded-md border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">No meaningful highlights or comments found yet.</p>
                      )}
                      {!notesSummary.available && (
                        <button onClick={handleGenerateNotesSummary} className="mt-4 text-sm font-semibold text-[var(--primary)] hover:opacity-80">
                          Regenerate
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeSideTab === 'highlights' && (
                <div className="space-y-3">
                  {sortedHighlights.map(h => {
                    const contextBefore = paper.fullText.substring(Math.max(0, h.start_offset - 50), h.start_offset);
                    const contextAfter = paper.fullText.substring(h.end_offset, Math.min(paper.fullText.length, h.end_offset + 50));
                    const highlightedText = paper.fullText.substring(h.start_offset, h.end_offset);
                    const canDelete = h.user_id === parseInt(user.id);
                    return (
                      <div key={h.id} className={`${colorClasses[h.color]} rounded-md p-3 text-sm`}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="font-semibold">{h.user_name || 'Unknown'}</span>
                          {canDelete && (
                            <button onClick={() => handleDeleteHighlight(h.id)} className="text-xs font-semibold opacity-70 hover:opacity-100">
                              Delete
                            </button>
                          )}
                        </div>
                        {contextBefore && <p className="mb-1 text-xs opacity-60">{contextBefore}</p>}
                        <p className="font-medium">{highlightedText}</p>
                        {contextAfter && <p className="mt-1 text-xs opacity-60">{contextAfter}</p>}
                      </div>
                    );
                  })}
                  {highlights.length === 0 && (
                    <p className="rounded-md border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">No highlights yet. Select text in the paper to add one.</p>
                  )}
                </div>
              )}

              {activeSideTab === 'comments' && (
                <div className="space-y-3">
                  {sortedComments.map(comment => (
                    <div key={comment.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]/45 p-4">
                      {editingCommentId === comment.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingCommentText}
                            onChange={(e) => setEditingCommentText(e.target.value)}
                            className={inputClass}
                            rows={3}
                          />
                          <div className="flex space-x-2">
                            <button onClick={() => handleUpdateComment(comment.id)} className="rounded-md px-3 py-1 text-sm text-white" style={{ background: 'var(--gradient-primary)' }}>
                              Save
                            </button>
                            <button onClick={() => { setEditingCommentId(null); setEditingCommentText(''); }} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-sm text-[var(--text)] transition-colors hover:bg-[var(--border)]">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-[var(--text)]">{comment.user_name || 'Unknown'}</div>
                              <div className="mt-1 text-xs text-[var(--text-muted)]">{new Date(comment.created_at).toLocaleDateString()}</div>
                            </div>
                            {comment.user_id === parseInt(user.id) && (
                              <div className="flex space-x-2">
                                <button onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.comment_text); }} className="text-sm text-[var(--primary)] transition-opacity hover:opacity-80">
                                  Edit
                                </button>
                                <button onClick={() => handleDeleteComment(comment.id)} className="text-sm text-red-400 transition-colors hover:text-red-300">
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="mb-2 rounded-md border-l-2 border-[var(--primary)] bg-[var(--surface)] p-2 text-sm italic text-[var(--text)]">
                            "{comment.commented_text}"
                          </div>
                          <div className="whitespace-pre-wrap text-[var(--text)]">{comment.comment_text}</div>
                        </>
                      )}
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <p className="rounded-md border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">No comments yet. Select text in the paper to add one.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Color Picker */}
      {showColorPicker && selectedText && (
        <div
          className="fixed bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 shadow-2xl z-50 flex flex-col space-y-2"
          style={{
            left: `${colorPickerPosition.x}px`,
            top: `${colorPickerPosition.y}px`,
            transform: 'translateX(-50%)',
            maxWidth: '90vw',
          }}
        >
          <div className="grid grid-cols-5 gap-2">
            {HIGHLIGHT_COLOR_ORDER.map(color => (
              <button
                key={color}
                onClick={() => handleCreateHighlight(color)}
                className={`h-9 w-9 rounded-lg border border-white/40 ${HIGHLIGHT_COLOR_CONFIG[color].swatch} transition-transform hover:-translate-y-0.5 hover:ring-2 ${HIGHLIGHT_COLOR_CONFIG[color].ring}`}
                title={HIGHLIGHT_COLOR_CONFIG[color].name}
              />
            ))}
          </div>
          <button
            onClick={() => { setShowColorPicker(false); setShowCommentDialog(true); }}
            className="text-white px-3 py-1.5 rounded-lg text-sm transition-opacity hover:opacity-90"
            style={{ background: 'var(--gradient-primary)' }}
          >
            Add Comment
          </button>
        </div>
      )}

      {/* Comment Dialog */}
      {showCommentDialog && selectedText && (
        <div
          className="fixed bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 shadow-2xl z-50"
          style={{
            left: `${colorPickerPosition.x}px`,
            top: `${colorPickerPosition.y}px`,
            transform: 'translateX(-50%)',
            minWidth: '300px',
            maxWidth: '90vw',
          }}
        >
          <div className="mb-2">
            <div className="text-sm text-[var(--text-muted)] mb-2">Selected text:</div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border)] p-2 rounded-lg text-sm text-[var(--text)] italic">
              "{selectedText.substring(0, 100)}{selectedText.length > 100 ? '...' : ''}"
            </div>
          </div>
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Enter your comment..."
            className={`${inputClass} mb-2`}
            rows={4}
            autoFocus
          />
          <div className="flex space-x-2">
            <button
              onClick={handleCreateComment}
              disabled={!commentText.trim()}
              className="text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              style={{ background: 'var(--gradient-primary)' }}
            >
              Add Comment
            </button>
            <button
              onClick={() => {
                setShowCommentDialog(false);
                setCommentText('');
                window.getSelection()?.removeAllRanges();
              }}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text)] px-4 py-2 rounded-lg text-sm hover:bg-[var(--border)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupDocumentViewer;
