import React, { useMemo, useState } from 'react';
import { Note } from '../types';
import { createNote, deleteNote } from '../services/apiService';
import { LoaderIcon } from './icons/LoaderIcon';
import { TrashIcon } from './icons/TrashIcon';
import { XIcon } from './icons/XIcon';
import type { ReaderSelection } from './HighlightableText';

interface NotesDeskProps {
  paperId: string;
  notes: Note[];
  selection: ReaderSelection | null;
  isOpen: boolean;
  onClose: () => void;
  onNotesChange: () => void;
  onJumpToParagraph?: (paragraphIndex: number | null) => void;
}

const NotesDesk: React.FC<NotesDeskProps> = ({
  paperId,
  notes,
  selection,
  isOpen,
  onClose,
  onNotesChange,
  onJumpToParagraph,
}) => {
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [notes]
  );

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!draft.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await createNote({
        paper_id: Number(paperId),
        content: draft.trim(),
        selected_text: selection?.text || undefined,
        start_offset: selection?.startOffset,
        end_offset: selection?.endOffset,
        paragraph_index: selection?.paragraphIndex ?? undefined,
      });
      setDraft('');
      onNotesChange();
    } catch (error) {
      console.error('Failed to save note', error);
      alert(error instanceof Error ? error.message : 'Failed to save note.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (noteId: number) => {
    if (!window.confirm('Delete this note from your library?')) return;
    setDeletingId(noteId);
    try {
      await deleteNote(noteId);
      onNotesChange();
    } catch (error) {
      console.error('Failed to delete note', error);
      alert(error instanceof Error ? error.message : 'Failed to delete note.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <aside className="fixed left-4 top-24 bottom-4 z-40 w-[340px] max-w-[calc(100vw-2rem)]" aria-label="Notes desk">
      <div className="h-full overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-xl text-[var(--text)]">Notes Desk</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Capture ideas while you read and keep them in your library.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
              title="Close notes"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex h-full flex-col overflow-y-auto px-5 pb-24 pt-5">
          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--bg-secondary)]/45 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
              New note
            </div>
            {selection?.text ? (
              <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Linked passage
                </div>
                <p className="mt-2 text-sm text-[var(--text)] leading-relaxed">"{selection.text}"</p>
                {selection.paragraphIndex !== null && (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">Paragraph {selection.paragraphIndex + 1}</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                Select a passage first if you want this note linked to a specific paragraph.
              </p>
            )}
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write your note, synthesis, question, or reminder..."
              rows={6}
              className="mt-4 w-full rounded-[20px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !draft.trim()}
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold text-[var(--primary-contrast)] transition-opacity disabled:opacity-45"
              style={{ background: 'var(--gradient-primary)' }}
            >
              {isSaving ? <LoaderIcon className="h-4 w-4 animate-spin" /> : 'Save note'}
            </button>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Saved notes
              </div>
              <div className="text-xs text-[var(--text-muted)]">{sortedNotes.length}</div>
            </div>
            <div className="space-y-3 pb-12">
              {sortedNotes.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--text-muted)]">
                  Your paper notes will appear here.
                </div>
              ) : (
                sortedNotes.map((note) => (
                  <div key={note.id} className="rounded-[22px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {note.paragraph_index !== null && note.paragraph_index !== undefined ? (
                          <button
                            type="button"
                            onClick={() => onJumpToParagraph?.(note.paragraph_index ?? null)}
                            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)] hover:underline"
                          >
                            Paragraph {note.paragraph_index + 1}
                          </button>
                        ) : (
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                            Free note
                          </div>
                        )}
                        {note.selected_text ? (
                          <p className="mt-2 text-sm italic text-[var(--text-muted)]">"{note.selected_text}"</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(note.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--danger)]"
                        title="Delete note"
                      >
                        {deletingId === note.id ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <TrashIcon className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--text)]">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default NotesDesk;
