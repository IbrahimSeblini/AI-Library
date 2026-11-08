import React, { useState, useEffect, useCallback, useRef } from "react";
import { Paper, Highlight, MasteryStatus, Note } from "../types";
import { toAPA, toBibTeX } from "../utils/citationExport";
import {
  getPaperById,
  getHighlights,
  getNotes,
  trackPaperView,
  getMasteryStatus,
  markPaperMastered,
  undoPaperMastered,
  startStudySession,
  logReadingActivity,
  deletePaper,
} from "../services/apiService";
import { LoaderIcon } from "./icons/LoaderIcon";
import { TrashIcon } from "./icons/TrashIcon";
import { SparklesIcon } from "./icons/SparklesIcon";
import { BookOpenIcon } from "./icons/BookOpenIcon";
import { XIcon } from "./icons/XIcon";
import QuizSection from "./QuizSection";
import HighlightableText from "./HighlightableText";
import HighlightsSidePanel from "./HighlightsSidePanel";
import ReadAloudExperience from "./ReadAloudExperience";
import ChallengeModal from "./ChallengeModal";
import NotesDesk from "./NotesDesk";
import type { ReaderSelection } from "./HighlightableText";
import { consumeReaderJumpTarget } from "../lib/readerNavigation";
import { queuePreferredLibrarianConversation, queuePreferredLibrarianPrompt } from "../lib/librarianConversation";

export interface CourseContext {
  courseId: number;
  courseTitle: string;
  position: number;
  total: number;
}

interface PaperDetailProps {
  paperId: string;
  onBack: () => void;
  onSummarize?: (text: string) => void;
  onParaphrase?: (text: string) => void;
  onViewAllHighlights?: () => void;
  /** Called after the paper is deleted from the library (so parent can remove from continue reading, etc.) */
  onDeletePaper?: (paperId: string) => void;
  /** Current user name, for Friends feed / trending papers */
  userName?: string;
  onOpenLibrarian?: () => void;
  /** When opened from a course — shows breadcrumb + prev/next navigation */
  courseContext?: CourseContext;
  onNavigateToCourse?: (courseId: number) => void;
  onNavigateToPrevPaper?: () => void;
  onNavigateToNextPaper?: () => void;
}

type UtilityPanel = "writing" | "listen" | "quiz" | null;
type QuizMode = "open" | "closed" | null;

// ── Quiz Progress Pips ────────────────────────────────────────────────────────

const QuizProgressPips: React.FC<{ correct: number; threshold: number }> = ({ correct, threshold }) => {
  const filled = Math.min(correct, threshold);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Array.from({ length: threshold }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: i < filled ? "var(--primary)" : "rgba(148,163,184,0.3)",
            transition: "background 0.3s ease",
            flexShrink: 0,
          }}
        />
      ))}
      <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>
        {correct}/{threshold} correct answers
      </span>
    </div>
  );
};

// ── Mastery Button ─────────────────────────────────────────────────────────────

interface MasteryButtonProps {
  paperId: string;
  mastery: MasteryStatus | null;
  onMasteryChange: (updated: MasteryStatus) => void;
}

const MasteryButton: React.FC<MasteryButtonProps> = ({ paperId, mastery, onMasteryChange }) => {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleMark = async () => {
    if (!mastery) return;
    if (!mastery.can_mark_mastered) {
      showToast(`Answer ${mastery.remaining} more question${mastery.remaining !== 1 ? "s" : ""} correctly in the quiz to mark this paper as mastered.`);
      return;
    }
    setLoading(true);
    try {
      const result = await markPaperMastered(paperId);
      if (result.success) {
        showToast(`Paper mastered! ${result.count} concept${result.count !== 1 ? "s" : ""} upgraded.`);
        onMasteryChange({ ...mastery, is_mastered: true });
      }
    } catch (err: any) {
      showToast(err?.message || "Failed to mark as mastered.");
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async () => {
    setLoading(true);
    try {
      await undoPaperMastered(paperId);
      onMasteryChange({ ...mastery!, is_mastered: false });
      showToast("Mastery mark removed.");
    } catch {
      showToast("Failed to undo mastery.");
    } finally {
      setLoading(false);
    }
  };

  if (!mastery) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Toast */}
      {toast && (
        <div
          className="text-xs px-3 py-2 rounded-lg"
          style={{
            background: "var(--primary-light)",
            color: "var(--primary)",
            border: "1px solid var(--primary)",
          }}
        >
          {toast}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {/* State C — Already mastered */}
        {mastery.is_mastered ? (
          <>
            <button
              onClick={() => showToast("You've mastered this paper. All related concepts show as Mastered in your roadmap.")}
              className="inline-flex items-center gap-2 min-h-[36px] py-2 px-4 rounded-lg font-semibold transition-all"
              style={{ background: "#f59e0b", color: "#1c1917" }}
              disabled={loading}
            >
              Mastered ✓
            </button>
            <button
              onClick={handleUndo}
              className="text-xs underline"
              style={{ color: "var(--text-muted)" }}
              disabled={loading}
            >
              Undo
            </button>
          </>
        ) : mastery.can_mark_mastered ? (
          /* State B — Quiz threshold met, ready to mark */
          <button
            onClick={handleMark}
            disabled={loading}
            className="inline-flex items-center gap-2 min-h-[36px] py-2 px-4 rounded-lg font-semibold text-white transition-all disabled:opacity-60"
            style={{
              background: "var(--gradient-primary)",
              boxShadow: "var(--glow-primary)",
            }}
          >
            {loading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : null}
            Mark as Mastered ✓
          </button>
        ) : (
          /* State A — Quiz threshold not met */
          <button
            onClick={handleMark}
            className="inline-flex items-center gap-2 min-h-[36px] py-2 px-4 rounded-lg font-semibold transition-all"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
            title="Complete 10 quiz questions correctly to unlock"
          >
            Mark as Mastered
          </button>
        )}
      </div>

      {/* Quiz progress — always shown */}
      {!mastery.is_mastered && (
        <QuizProgressPips
          correct={mastery.quiz_correct_count}
          threshold={mastery.quiz_threshold}
        />
      )}
    </div>
  );
};

const RoadmapProgressGuide: React.FC<{
  paper: Paper;
  mastery: MasteryStatus | null;
  onOpenLibrarian?: () => void;
}> = ({ paper, mastery, onOpenLibrarian }) => {
  if (!mastery) return null;
  const relatedCount = mastery.related_concepts_count ?? mastery.related_concepts?.length ?? 0;
  const currentLevel = mastery.is_mastered
    ? 'Mastered'
    : mastery.quiz_correct_count > 0
      ? 'Engaged'
      : 'Reading';
  const nextAction = mastery.is_mastered
    ? 'This paper is already contributing mastered evidence to related roadmap concepts.'
    : mastery.can_mark_mastered
      ? 'Mark this paper as mastered to upgrade related roadmap concepts.'
      : `Answer ${mastery.remaining} more quiz question${mastery.remaining !== 1 ? 's' : ''} correctly to unlock mastery.`;

  const handleAsk = () => {
    if (!onOpenLibrarian) return;
    queuePreferredLibrarianPrompt(`Answer from my library: for the paper "${paper.title}", explain how I should move from reading to engaged to mastered, and which concepts I should focus on first.`);
    onOpenLibrarian();
  };

  return (
    <div className="mt-4 border-y border-[var(--border)]/70 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Roadmap progress</p>
          <p className="mt-1 text-sm text-[var(--text)]">
            <span className="font-semibold">{currentLevel}</span>
            <span className="text-[var(--text-muted)]"> · Reading → Engaged → Mastered</span>
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{nextAction}</p>
          {relatedCount > 0 && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              This paper connects to {relatedCount} roadmap concept{relatedCount !== 1 ? 's' : ''}.
            </p>
          )}
        </div>
        {onOpenLibrarian && (
          <button
            type="button"
            onClick={handleAsk}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--primary)] transition-colors hover:bg-[var(--primary-light)]"
          >
            Ask Librarian
          </button>
        )}
      </div>
    </div>
  );
};

interface InlineActionProps {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  emphasis?: "neutral" | "primary";
}

const InlineAction: React.FC<InlineActionProps> = ({ label, icon, onClick, emphasis = "neutral" }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 hover:bg-[var(--bg-secondary)]"
    style={{
      color: emphasis === "primary" ? "var(--primary)" : "var(--text-muted)",
      background: emphasis === "primary" ? "var(--primary-light)" : "transparent",
    }}
  >
    {icon}
    {label}
  </button>
);

// ── Cite Popup ─────────────────────────────────────────────────────────────────

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const QuoteIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z" />
  </svg>
);

const CitePopup: React.FC<{ paper: Paper; onClose: () => void }> = ({ paper, onClose }) => {
  const [tab, setTab] = useState<"apa" | "bibtex">("apa");
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const apaText = toAPA(paper);
  const bibtexText = toBibTeX(paper);
  const text = tab === "apa" ? apaText : bibtexText;

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-[calc(100%+10px)] z-50 w-[420px] rounded-2xl border border-[var(--border)] overflow-hidden"
      style={{
        background: "var(--surface)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]/60">
        <span className="text-sm font-semibold text-[var(--text)]">Export Citation</span>
        {/* Format toggle pill */}
        <div
          className="flex rounded-full p-0.5 gap-0.5"
          style={{ background: "var(--bg-secondary)" }}
        >
          {(["apa", "bibtex"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setCopied(false); }}
              className="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-all duration-150"
              style={
                tab === t
                  ? { background: "var(--surface)", color: "var(--text)", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }
                  : { color: "var(--text-muted)" }
              }
            >
              {t === "apa" ? "APA" : "BibTeX"}
            </button>
          ))}
        </div>
      </div>

      {/* Citation text */}
      <div className="px-5 py-4">
        {tab === "apa" ? (
          <p
            className="text-sm leading-relaxed text-[var(--text)] select-all"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: "1.75" }}
          >
            {apaText}
          </p>
        ) : (
          <pre
            className="text-[12.5px] leading-relaxed text-[var(--text)] whitespace-pre-wrap break-all select-all"
            style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace", maxHeight: 180, overflowY: "auto" }}
          >
            {bibtexText}
          </pre>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]/60"
        style={{ background: "var(--bg-secondary)/40" }}
      >
        <span className="text-xs text-[var(--text-muted)]">
          {tab === "apa" ? "APA 7th Edition" : "BibTeX @article"}
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-150"
          style={
            copied
              ? { background: "var(--primary)", color: "#fff" }
              : { background: "var(--gradient-primary)", color: "#fff", boxShadow: "var(--glow-primary)" }
          }
        >
          {copied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5" />
              Copied
            </>
          ) : (
            "Copy citation"
          )}
        </button>
      </div>
    </div>
  );
};

// ── PaperDetail ────────────────────────────────────────────────────────────────

const PaperDetail: React.FC<PaperDetailProps> = ({ paperId, onBack, onSummarize, onParaphrase, onViewAllHighlights, onDeletePaper, userName = '', onOpenLibrarian, courseContext, onNavigateToCourse, onNavigateToPrevPaper, onNavigateToNextPaper }) => {
  const [paper, setPaper] = useState<Paper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [mastery, setMastery] = useState<MasteryStatus | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isChallengeOpen, setIsChallengeOpen] = useState(false);
  const [challengeText, setChallengeText] = useState("");
  const [isCiteOpen, setIsCiteOpen] = useState(false);
  const [isQuizPickerOpen, setIsQuizPickerOpen] = useState(false);
  const [isHighlightsPanelOpen, setIsHighlightsPanelOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number | null>(null);
  const [returnConversationId, setReturnConversationId] = useState<number | null>(null);
  const [activeUtilityPanel, setActiveUtilityPanel] = useState<UtilityPanel>(null);
  const [quizMode, setQuizMode] = useState<QuizMode>(null);
  const [closedBookQuizLocked, setClosedBookQuizLocked] = useState(false);
  const [quizForceFailSignal, setQuizForceFailSignal] = useState(0);

  const fetchPaper = async () => {
    setIsLoading(true);
    try {
      const fetchedPaper = await getPaperById(paperId);
      setPaper(fetchedPaper || null);
      if (fetchedPaper) {
        // Restart the study session with the paper's subject so "Reading by Subject" is populated
        startStudySession('reading', fetchedPaper.subject, paperId).catch(() => {});
        // Log "opened" for Friends feed and Trending Papers
        logReadingActivity(paperId, fetchedPaper.title, 'opened', userName).catch(() => {});
      }
    } catch (error) {
      console.error("Failed to fetch paper details", error);
      setPaper(null);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHighlights = async () => {
    try {
      const fetchedHighlights = await getHighlights(paperId);
      setHighlights(fetchedHighlights);
    } catch (error) {
      console.error("Failed to fetch highlights", error);
    }
  };

  const fetchNotes = async () => {
    try {
      const fetchedNotes = await getNotes(paperId);
      setNotes(fetchedNotes);
    } catch (error) {
      console.error("Failed to fetch notes", error);
    }
  };

  const fetchMasteryStatus = useCallback(async () => {
    if (!paperId || !/^\d+$/.test(paperId)) return; // only call when we have a numeric paper id
    try {
      const status = await getMasteryStatus(paperId);
      setMastery(status);
    } catch {
      // Non-critical — mastery button just won't show
    }
  }, [paperId]);

  useEffect(() => {
    fetchPaper();
    fetchHighlights();
    fetchNotes();
    // Track paper view for Knowledge Roadmap mastery scoring (STATE 2)
    if (paperId && /^\d+$/.test(paperId)) trackPaperView(paperId);
    fetchMasteryStatus();
  }, [paperId]);

  useEffect(() => {
    if (!paper) return;
    const target = consumeReaderJumpTarget();
    if (!target || target.paperId !== paperId) return;
    setReturnConversationId(target.conversationId ?? null);
    setActiveParagraphIndex(target.paragraphIndex);
    setTimeout(() => {
      const el = document.getElementById(`paper-paragraph-${target.paragraphIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
  }, [paperId, paper]);

  // Refresh mastery when quiz is submitted; auto-mark as mastered if threshold hit (e.g. 10/10)
  const handleQuizSubmit = useCallback(
    async (result?: { can_mark_mastered?: boolean }) => {
      await fetchMasteryStatus();
      if (result?.can_mark_mastered) {
        try {
          const res = await markPaperMastered(paperId);
          if (res.success) {
            setMastery((prev) => (prev ? { ...prev, is_mastered: true } : null));
          }
        } catch {
          // ignore
        }
      }
    },
    [paperId, fetchMasteryStatus]
  );

  const canQuiz = Boolean(paper?.fullText && paper.fullText.length >= 120);
  const isOpenBookQuizActive = quizMode === "open";
  const isClosedBookQuizActive = quizMode === "closed";

  const requestClosedBookQuizClose = useCallback(() => {
    if (closedBookQuizLocked) {
      const shouldFail = window.confirm(
        "Leaving this closed-book quiz now will count as a failed attempt. Do you want to fail the quiz and exit?"
      );
      if (!shouldFail) return;
      setQuizForceFailSignal((prev) => prev + 1);
    }
    setQuizMode(null);
  }, [closedBookQuizLocked]);

  useEffect(() => {
    if (!isClosedBookQuizActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClosedBookQuizClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isClosedBookQuizActive, requestClosedBookQuizClose]);

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
        <h2 className="text-2xl font-bold text-red-400">Paper not found</h2>
        <p className="mt-2 text-[var(--text-muted)]">
          The requested document could not be loaded.
        </p>
        <button
          onClick={onBack}
          className="mt-6 text-white font-bold py-2 px-4 rounded-lg"
          style={{ background: "var(--gradient-primary)" }}
        >
          Go Back
        </button>
      </div>
    );
  }

  const handleDelete = async () => {
    const shouldDelete = window.confirm(
      `Delete "${paper.title}" from your library?\n\nThis removes the paper and its saved context from your library view. This action cannot be undone.`
    );
    if (!shouldDelete) return;
    setIsDeleting(true);
    try {
      await deletePaper(paperId);
      onDeletePaper?.(paperId);
      onBack();
    } catch (err) {
      console.error("Failed to delete paper", err);
      alert(err instanceof Error ? err.message : "Failed to delete document.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleJumpToHighlight = (h: Highlight) => {
    setIsHighlightsPanelOpen(false);
    const paragraphMatch = notes.find((note) => note.start_offset === h.start_offset)?.paragraph_index ?? null;
    if (paragraphMatch !== null && paragraphMatch !== undefined) {
      setActiveParagraphIndex(paragraphMatch);
    }
    const el = document.querySelector(`[data-highlight-id="${h.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLElement).classList.add('ring-2', 'ring-[var(--primary)]');
      setTimeout(() => (el as HTMLElement).classList.remove('ring-2', 'ring-[var(--primary)]'), 1500);
    }
  };

  const handleJumpToParagraph = (paragraphIndex: number | null) => {
    if (paragraphIndex === null || paragraphIndex === undefined) return;
    setActiveParagraphIndex(paragraphIndex);
    const element = document.getElementById(`paper-paragraph-${paragraphIndex}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleOpenChallenge = () => {
    const selectedText = window.getSelection?.()?.toString().trim() || "";
    const sourceText = selectedText || paper.fullText;
    if (!sourceText.trim()) return;
    setChallengeText(sourceText);
    setIsChallengeOpen(true);
  };

  const requestUtilityPanelChange = (nextPanel: UtilityPanel) => {
    if (quizMode === "closed" && closedBookQuizLocked && nextPanel !== "quiz") {
      requestClosedBookQuizClose();
      return;
    }
    if (nextPanel !== "quiz" && quizMode && !(quizMode === "closed" && closedBookQuizLocked)) {
      setQuizMode(null);
    }
    setActiveUtilityPanel(nextPanel);
  };

  const toggleUtilityPanel = (panel: Exclude<UtilityPanel, null>) => {
    requestUtilityPanelChange(activeUtilityPanel === panel ? null : panel);
  };

  const startQuizMode = (mode: QuizMode) => {
    setQuizMode(mode);
    setActiveUtilityPanel(null);
  };

  return (
    <>
    <button
      type="button"
      onClick={() => setIsNotesOpen((prev) => !prev)}
      className="fixed left-4 top-1/2 -translate-y-1/2 z-30 hidden lg:flex flex-col items-center gap-2 rounded-[24px] border border-[var(--border)] bg-[var(--surface)]/95 px-3 py-4 text-[var(--text)] shadow-lg backdrop-blur-sm transition-transform hover:translate-x-[4px]"
      style={{ boxShadow: "var(--shadow-md)" }}
      aria-label={isNotesOpen ? "Close notes desk" : "Open notes desk"}
      title={isNotesOpen ? "Close notes desk" : "Open notes desk"}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] [writing-mode:vertical-rl] rotate-180">
        Notes
      </span>
      <span
        className="min-w-[28px] h-7 rounded-full px-2 inline-flex items-center justify-center text-xs font-bold"
        style={{ background: "var(--primary-light)", color: "var(--primary)" }}
      >
        {notes.length}
      </span>
    </button>

    <button
      type="button"
      onClick={() => setIsHighlightsPanelOpen((prev) => !prev)}
      className="fixed right-4 top-1/2 -translate-y-1/2 z-30 hidden lg:flex flex-col items-center gap-2 rounded-[24px] border border-[var(--border)] bg-[var(--surface)]/95 px-3 py-4 text-[var(--text)] shadow-lg backdrop-blur-sm transition-transform hover:translate-x-[-4px]"
      style={{ boxShadow: "var(--shadow-md)" }}
      aria-label={isHighlightsPanelOpen ? "Close highlights panel" : "Open highlights panel"}
      title={isHighlightsPanelOpen ? "Close highlights panel" : "Open highlights panel"}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] [writing-mode:vertical-rl] rotate-180">
        Highlights
      </span>
      <span
        className="min-w-[28px] h-7 rounded-full px-2 inline-flex items-center justify-center text-xs font-bold"
        style={{ background: "var(--primary-light)", color: "var(--primary)" }}
      >
        {highlights.length}
      </span>
    </button>

    <button
      type="button"
      onClick={() => setIsHighlightsPanelOpen(true)}
      className="fixed bottom-6 right-6 z-30 lg:hidden inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg"
      style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-md)" }}
      aria-label="Open highlights panel"
    >
      <SparklesIcon className="w-4 h-4" />
      Highlights
      <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{highlights.length}</span>
    </button>

    <button
      type="button"
      onClick={() => setIsNotesOpen(true)}
      className="fixed bottom-6 left-6 z-30 lg:hidden inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-[var(--primary-contrast)] shadow-lg"
      style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-md)" }}
      aria-label="Open notes desk"
    >
      Notes
      <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{notes.length}</span>
    </button>

    <div className={`mx-auto px-6 sm:px-8 md:px-10 py-8 transition-all duration-300 max-w-[1680px] ${isNotesOpen ? 'lg:pl-[24rem]' : ''} ${isHighlightsPanelOpen ? 'lg:pr-[24rem]' : ''}`}>
      <div className="w-full min-w-0">
        <div className="mb-8 flex items-start justify-between gap-4 border-b border-[var(--border)]/70 pb-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {courseContext && onNavigateToCourse ? (
                <button
                  onClick={() => onNavigateToCourse(courseContext.courseId)}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-light)]"
                >
                  <span aria-hidden="true">&larr;</span>
                  {courseContext.courseTitle}
                </button>
              ) : (
                <button
                  onClick={onBack}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                >
                  <span aria-hidden="true">&larr;</span>
                  Back to Search
                </button>
              )}
              {courseContext && (
                <span className="text-sm text-[var(--text-muted)]">
                  Paper {courseContext.position + 1} of {courseContext.total}
                </span>
              )}
              {returnConversationId && onOpenLibrarian ? (
                <button
                  type="button"
                  onClick={() => {
                    queuePreferredLibrarianConversation(returnConversationId);
                    onOpenLibrarian();
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-light)]"
                >
                  Return to Librarian
                </button>
              ) : null}
            </div>

            <div className="mt-5">
              <span
                className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]"
                style={{ background: "var(--primary-light)" }}
              >
                {paper.subject}
              </span>
            </div>

            <h1 className="mt-4 text-3xl md:text-5xl font-extrabold text-[var(--text)] tracking-tight font-display leading-[1.05]">
              {paper.title}
            </h1>

            <p className="mt-4 text-lg text-[var(--text-muted)]">
              By {paper.authors.length ? paper.authors.join(", ") : "Unknown"} · {paper.structuredContent?.published_date || paper.publicationYear || "—"}
            </p>
            {paper.structuredContent && (
              <div className="mt-3 space-y-1 text-sm text-[var(--text-muted)]">
                {(paper.structuredContent.affiliations?.length ?? 0) > 0 && (
                  <p><span className="font-medium text-[var(--text)]">Affiliations:</span> {paper.structuredContent.affiliations!.join("; ")}</p>
                )}
                {(paper.structuredContent.emails?.length ?? 0) > 0 && (
                  <p><span className="font-medium text-[var(--text)]">Emails:</span> {paper.structuredContent.emails!.join(", ")}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            {courseContext && (onNavigateToPrevPaper || onNavigateToNextPaper) && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onNavigateToPrevPaper}
                  disabled={!onNavigateToPrevPaper || courseContext.position === 0}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors disabled:opacity-30"
                  style={{ color: "var(--text-muted)" }}
                  title="Previous paper"
                  aria-label="Previous paper in course"
                >
                  <span aria-hidden="true">&#8249;</span>
                </button>
                <button
                  type="button"
                  onClick={onNavigateToNextPaper}
                  disabled={!onNavigateToNextPaper || courseContext.position >= courseContext.total - 1}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors disabled:opacity-30"
                  style={{ color: "var(--text-muted)" }}
                  title="Next paper"
                  aria-label="Next paper in course"
                >
                  <span aria-hidden="true">&#8250;</span>
                </button>
              </div>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsCiteOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-150"
                style={{ color: isCiteOpen ? "var(--primary)" : "var(--text-muted)" }}
                title="Export citation"
              >
                <QuoteIcon className="w-3.5 h-3.5 flex-shrink-0" />
                Cite
              </button>
              {isCiteOpen && (
                <CitePopup paper={paper} onClose={() => setIsCiteOpen(false)} />
              )}
            </div>
            {onDeletePaper && (
              <>
                <div className="w-px h-3.5 rounded-full flex-shrink-0" style={{ background: "var(--border)" }} />
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="inline-flex items-center justify-center transition-colors duration-150 disabled:opacity-40 hover:text-[var(--danger)]"
                  style={{ color: "var(--text-muted)" }}
                  title="Delete from library"
                  aria-label="Delete from library"
                >
                  {isDeleting ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <TrashIcon className="h-4 w-4" />}
                </button>
              </>
            )}
          </div>
        </div>

        <article className="space-y-10">
        <section className="w-full">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {paper.structuredContent?.abstract ? "Abstract" : "Summary"}
          </h2>
          <p className="text-[var(--text)] leading-relaxed text-base">
            {paper.structuredContent?.abstract ?? paper.summary}
          </p>
        </section>

        {paper.structuredContent?.keywords && paper.structuredContent.keywords.length > 0 && (
          <section className="w-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Keywords
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {paper.structuredContent.keywords.map((kw, i) => (
                <span key={i} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-sm text-[var(--text)]">
                  {kw}
                </span>
              ))}
            </div>
          </section>
        )}

        {paper.structuredContent?.references && paper.structuredContent.references.length > 0 && (
          <section className="w-full border-t border-[var(--border)]/70 pt-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                References
              </h2>
            </div>
            <ol className="list-decimal list-inside space-y-2 text-sm text-[var(--text)]">
              {paper.structuredContent.references.map((ref, i) => (
                <li key={i} className="pl-2">{ref}</li>
              ))}
            </ol>
          </section>
        )}

        <section className="border-t border-[var(--border)]/70 pt-8">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Reading
                </h2>
              </div>
            </div>
            {mastery !== null && (
              <MasteryButton
                paperId={paperId}
                mastery={mastery}
                onMasteryChange={setMastery}
              />
            )}
          </div>

          {mastery !== null && (
            <RoadmapProgressGuide
              paper={paper}
              mastery={mastery}
              onOpenLibrarian={onOpenLibrarian}
            />
          )}

          <div className="mb-6 border-b border-[var(--border)]/60 pb-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toggleUtilityPanel("writing")}
                  aria-expanded={activeUtilityPanel === "writing"}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors"
                  style={{
                    background: activeUtilityPanel === "writing" ? "var(--primary-light)" : "var(--surface)",
                    color: activeUtilityPanel === "writing" ? "var(--primary)" : "var(--text)",
                    borderColor: activeUtilityPanel === "writing"
                      ? "color-mix(in srgb, var(--primary) 28%, white)"
                      : "rgba(148, 163, 184, 0.18)",
                  }}
                >
                  <SparklesIcon className="h-4 w-4" />
                  Writing Tools
                  <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${activeUtilityPanel === "writing" ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                <button
                  type="button"
                  onClick={() => toggleUtilityPanel("listen")}
                  aria-expanded={activeUtilityPanel === "listen"}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors"
                  style={{
                    background: activeUtilityPanel === "listen" ? "var(--primary-light)" : "var(--surface)",
                    color: activeUtilityPanel === "listen" ? "var(--primary)" : "var(--text)",
                    borderColor: activeUtilityPanel === "listen"
                      ? "color-mix(in srgb, var(--primary) 28%, white)"
                      : "rgba(148, 163, 184, 0.18)",
                  }}
                >
                  <span aria-hidden="true">▶</span>
                  Listen
                  <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${activeUtilityPanel === "listen" ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                <button
                  type="button"
                  onClick={() => canQuiz && setIsQuizPickerOpen(true)}
                  aria-expanded={quizMode !== null}
                  disabled={!canQuiz}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors"
                  style={{
                    background: quizMode !== null ? "var(--primary-light)" : "var(--surface)",
                    color: quizMode !== null ? "var(--primary)" : "var(--text)",
                    borderColor: quizMode !== null
                      ? "color-mix(in srgb, var(--primary) 28%, white)"
                      : "rgba(148, 163, 184, 0.18)",
                  }}
                >
                  <BookOpenIcon className="h-4 w-4" />
                  Quiz
                </button>
              </div>

            </div>

            {activeUtilityPanel === "writing" && (
              <div className="mt-4 border-t border-[var(--border)]/60 pt-4">
                <div className="flex flex-wrap gap-1">
                  {onSummarize && paper.fullText && (
                    <InlineAction
                      label="Summarize"
                      icon={
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <line x1="21" y1="10" x2="7" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="11" y2="14" /><line x1="21" y1="18" x2="7" y2="18" />
                        </svg>
                      }
                      onClick={() => onSummarize(paper.fullText)}
                      emphasis="primary"
                    />
                  )}
                  {onParaphrase && paper.fullText && (
                    <InlineAction
                      label="Paraphrase"
                      icon={
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
                          <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
                        </svg>
                      }
                      onClick={() => onParaphrase(paper.fullText)}
                    />
                  )}
                  {paper.fullText && (
                    <InlineAction
                      label="Challenge"
                      icon={
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                      }
                      onClick={handleOpenChallenge}
                    />
                  )}
                  <InlineAction
                    label="Notes"
                    icon={
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    }
                    onClick={() => setIsNotesOpen(true)}
                  />
                </div>
              </div>
            )}

            {activeUtilityPanel === "listen" && (
              <div className="mt-4 border-t border-[var(--border)]/60 pt-4">
                <ReadAloudExperience
                  compact
                  bookId={paperId}
                  title={paper.title}
                  text={paper.fullText}
                />
              </div>
            )}

            {quizMode !== null && (
              <div className="mt-4 border-t border-[var(--border)]/60 pt-4">
                {quizMode === "open" ? (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Open-Book Quiz
                    </div>
                    <div className="mt-1 text-sm text-[var(--text)]">
                      The questions are now docked beside the text so you can read and answer together.
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-[var(--border)]/60 pt-4">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          Quiz Mode
                        </div>
                        <div className="mt-1 text-sm text-[var(--text)]">
                          {quizMode === "open" ? "Open Book" : "Closed Book"}
                        </div>
                      </div>
                      {!closedBookQuizLocked && (
                        <button
                          type="button"
                          onClick={() => setQuizMode(null)}
                          className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                          style={{ borderColor: "rgba(148, 163, 184, 0.18)" }}
                        >
                          Change mode
                        </button>
                      )}
                    </div>

                    <QuizSection
                      key={quizMode}
                      paper={paper}
                      paperId={paperId}
                      onQuizSubmit={handleQuizSubmit}
                      mode={quizMode}
                      forceFailSignal={quizForceFailSignal}
                      onLockStateChange={setClosedBookQuizLocked}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={isOpenBookQuizActive ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]" : "max-w-none"}>
            <div className="min-w-0">
              {isClosedBookQuizActive ? null : (
                <div className="text-[var(--text)] leading-relaxed whitespace-pre-wrap text-[1.03rem]">
                  <HighlightableText
                    text={paper.fullText}
                    paperId={paperId}
                    highlights={highlights}
                    onHighlightsChange={fetchHighlights}
                    onSelectionChange={setSelection}
                    activeParagraphIndex={activeParagraphIndex}
                  />
                </div>
              )}
            </div>

            {isOpenBookQuizActive && (
              <aside className="min-w-0 self-start border-t border-[var(--border)]/70 pt-6 xl:sticky xl:top-24 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <div>
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Open-Book Quiz
                      </div>
                      <div className="mt-1 text-sm text-[var(--text-muted)]">
                        Read on the left and answer on the right.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuizMode(null)}
                      className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                      style={{ borderColor: "rgba(148, 163, 184, 0.18)" }}
                    >
                      End quiz
                    </button>
                  </div>

                  <QuizSection
                    key="open-book"
                    paper={paper}
                    paperId={paperId}
                    onQuizSubmit={handleQuizSubmit}
                    mode="open"
                    onLockStateChange={setClosedBookQuizLocked}
                  />
                </div>
              </aside>
            )}
          </div>
        </section>
      </article>
      </div>
    </div>
    {(isHighlightsPanelOpen || isNotesOpen) && (
      <>
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px]"
          onClick={() => {
            setIsHighlightsPanelOpen(false);
            setIsNotesOpen(false);
          }}
        />
        <NotesDesk
          paperId={paperId}
          notes={notes}
          selection={selection}
          isOpen={isNotesOpen}
          onClose={() => setIsNotesOpen(false)}
          onNotesChange={fetchNotes}
          onJumpToParagraph={handleJumpToParagraph}
        />
        <HighlightsSidePanel
          paperId={paperId}
          highlights={highlights}
          isOpen={isHighlightsPanelOpen}
          onClose={() => setIsHighlightsPanelOpen(false)}
          onViewAllHighlights={() => {
            setIsHighlightsPanelOpen(false);
            onViewAllHighlights?.();
          }}
          onJumpToHighlight={handleJumpToHighlight}
        />
      </>
    )}
    {isQuizPickerOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
        onClick={() => setIsQuizPickerOpen(false)}
      >
        <div
          className="w-full max-w-lg rounded-3xl border border-[var(--border)] overflow-hidden shadow-2xl"
          style={{ background: "var(--surface)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-7 py-5 border-b border-[var(--border)]/60">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Choose quiz mode</p>
              <h2 className="mt-1 text-xl font-bold text-[var(--text)] font-display">Test your understanding</h2>
            </div>
            <button
              onClick={() => setIsQuizPickerOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Options */}
          <div className="p-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { setIsQuizPickerOpen(false); startQuizMode("open"); }}
              className="group flex flex-col items-start gap-3 rounded-2xl p-5 text-left transition-all duration-150 border hover:border-[var(--primary)]/40"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--primary-light)" }}>
                <BookOpenIcon className="w-5 h-5 text-[var(--primary)]" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Open Book</p>
                <p className="mt-1 text-base font-semibold text-[var(--text)]">With the text</p>
                <p className="mt-1.5 text-xs text-[var(--text-muted)] leading-relaxed">Read and answer freely — the paper stays visible beside you.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => { setIsQuizPickerOpen(false); startQuizMode("closed"); }}
              className="group flex flex-col items-start gap-3 rounded-2xl p-5 text-left transition-all duration-150 border hover:border-[var(--primary)]/40"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(249,115,22,0.1)" }}>
                <svg className="w-5 h-5" style={{ color: "#f97316" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Closed Book</p>
                <p className="mt-1 text-base font-semibold text-[var(--text)]">From memory</p>
                <p className="mt-1.5 text-xs text-[var(--text-muted)] leading-relaxed">Leaving once started counts as a failed attempt.</p>
              </div>
            </button>
          </div>

          <div className="px-7 pb-5 text-xs text-[var(--text-muted)]">
            Both modes contribute toward your mastery score.
          </div>
        </div>
      </div>
    )}

    {isChallengeOpen && (
      <ChallengeModal
        text={challengeText}
        onClose={() => setIsChallengeOpen(false)}
      />
    )}
    {isClosedBookQuizActive && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border)]/70 px-6 py-5 sm:px-8">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Closed-Book Quiz
              </div>
              <div className="mt-2 text-base text-[var(--text-muted)]">
                Focus mode is active. Solve inside this window only.
              </div>
              {closedBookQuizLocked && (
                <div className="mt-2 text-sm text-[var(--primary)]">
                  Leaving now will count as a failed attempt.
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestClosedBookQuizClose}
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                style={{ borderColor: "rgba(148, 163, 184, 0.18)" }}
              >
                {closedBookQuizLocked ? "Fail & exit" : "Exit"}
              </button>
              <button
                type="button"
                onClick={requestClosedBookQuizClose}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                style={{ borderColor: "rgba(148, 163, 184, 0.18)" }}
                aria-label={closedBookQuizLocked ? "Fail quiz and close" : "Close closed-book quiz"}
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
            <div className="mx-auto w-full max-w-4xl">
              <QuizSection
                key="closed-book-modal"
                paper={paper}
                paperId={paperId}
                onQuizSubmit={handleQuizSubmit}
                mode="closed"
                forceFailSignal={quizForceFailSignal}
                onLockStateChange={setClosedBookQuizLocked}
              />
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default PaperDetail;
