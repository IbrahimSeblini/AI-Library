import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Paper, QuizQuestion } from '../types';
import {
  DEFAULT_MIX,
  DifficultyKey,
  DifficultyMix,
  MAX_PER_LEVEL,
  MAX_TOTAL_QUESTIONS,
  generateQuizFromText,
} from '../services/quizService';
import { submitQuizResult } from '../services/apiService';
import { LoaderIcon } from './icons/LoaderIcon';
import { BookOpenIcon } from './icons/BookOpenIcon';

// ── Demo quiz shown when AI quota is exceeded ─────────────────────────────────
const DEMO_QUIZ: QuizQuestion[] = [
  {
    id: 'demo-1',
    question: 'What is the primary goal of academic research?',
    options: [
      'To generate profit for institutions',
      'To advance knowledge and understanding in a field',
      'To produce textbooks for students',
      'To replace existing theories entirely',
    ],
    answerIndex: 1,
    difficulty: 'easy',
    explanation: 'Academic research aims to contribute new knowledge, test hypotheses, and deepen understanding within a discipline.',
  },
  {
    id: 'demo-2',
    question: 'Which of the following best describes a peer-reviewed paper?',
    options: [
      'A paper written by multiple authors',
      'A paper published in a newspaper',
      'A paper evaluated by experts in the same field before publication',
      'A paper that cites at least 20 sources',
    ],
    answerIndex: 2,
    difficulty: 'easy',
    explanation: 'Peer review means the paper was critically assessed by independent subject-matter experts before being accepted for publication.',
  },
  {
    id: 'demo-3',
    question: 'What does a literature review typically accomplish in a research paper?',
    options: [
      'It summarises the author\'s personal opinions',
      'It provides the experimental methodology',
      'It surveys existing work to contextualise the new research',
      'It lists all figures and tables used',
    ],
    answerIndex: 2,
    difficulty: 'normal',
    explanation: 'A literature review surveys prior work in the area, identifying gaps and situating the new contribution relative to what is already known.',
  },
  {
    id: 'demo-4',
    question: 'Why might a researcher use a control group in an experiment?',
    options: [
      'To increase the sample size automatically',
      'To provide a baseline for comparing the effect of the independent variable',
      'To ensure the experiment takes longer',
      'To satisfy journal word-count requirements',
    ],
    answerIndex: 1,
    difficulty: 'normal',
    explanation: 'A control group experiences no experimental treatment, allowing the researcher to isolate and measure the effect of the variable being tested.',
  },
  {
    id: 'demo-5',
    question: 'A study finds a strong correlation between two variables. What can be directly concluded?',
    options: [
      'Variable A causes variable B',
      'Variable B causes variable A',
      'The variables are statistically associated but causation cannot be established from correlation alone',
      'The study\'s hypothesis is proven',
    ],
    answerIndex: 2,
    difficulty: 'hard',
    explanation: 'Correlation indicates a statistical relationship, but establishing causation requires additional evidence such as controlled experiments or longitudinal data.',
  },
];

interface QuizSectionProps {
  paper: Paper;
  paperId: string;
  /** Called after quiz result is saved; receives API result (e.g. can_mark_mastered). */
  onQuizSubmit?: (result?: { ok: boolean; cumulative_correct: number; can_mark_mastered: boolean }) => void;
  mode?: 'open' | 'closed';
  forceFailSignal?: number;
  onLockStateChange?: (locked: boolean) => void;
}

const difficultyMeta: Record<
  DifficultyKey,
  { label: string; description: string; badgeStyle: React.CSSProperties; badgeBg: string; card: string }
> = {
  easy: {
    label: 'Easy',
    description: 'Direct recall of explicitly stated facts.',
    badgeBg: 'bg-emerald-500/10 border border-emerald-500/40',
    badgeStyle: { color: 'var(--text)' },
    card: 'border-emerald-400/30',
  },
  normal: {
    label: 'Normal',
    description: 'Connect two ideas or interpret author intent.',
    badgeBg: 'bg-amber-500/10 border border-amber-500/40',
    badgeStyle: { color: 'var(--text)' },
    card: 'border-amber-400/30',
  },
  hard: {
    label: 'Hard',
    description: 'Multi-step synthesis that spans the passage.',
    badgeBg: 'bg-rose-500/10 border border-rose-500/40',
    badgeStyle: { color: 'var(--text)' },
    card: 'border-rose-400/30',
  },
};

const QuizSection: React.FC<QuizSectionProps> = ({
  paper,
  paperId,
  onQuizSubmit,
  mode = 'open',
  forceFailSignal = 0,
  onLockStateChange,
}) => {
  const [difficultyMix, setDifficultyMix] = useState<DifficultyMix>(DEFAULT_MIX);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [choices, setChoices] = useState<Record<string, number | null>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [forcedFailureMessage, setForcedFailureMessage] = useState<string | null>(null);
  const lastHandledForceFailSignal = useRef(0);

  const totalRequested = useMemo(
    () => difficultyMix.easy + difficultyMix.normal + difficultyMix.hard,
    [difficultyMix]
  );
  const totalsInvalid = totalRequested === 0 || totalRequested > MAX_TOTAL_QUESTIONS;
  const isLockedClosedBook = mode === 'closed' && questions.length > 0 && !showResults;

  useEffect(() => {
    onLockStateChange?.(isLockedClosedBook);
    return () => onLockStateChange?.(false);
  }, [isLockedClosedBook, onLockStateChange]);

  useEffect(() => {
    if (
      mode !== 'closed' ||
      !questions.length ||
      showResults ||
      forceFailSignal === 0 ||
      forceFailSignal === lastHandledForceFailSignal.current
    ) {
      return;
    }

    lastHandledForceFailSignal.current = forceFailSignal;
    setForcedFailureMessage('Closed-book quiz ended as a failed attempt because you left the questions before finishing.');
    setShowResults(true);
    submitQuizResult(paperId, 0, questions.length)
      .then((res) => onQuizSubmit?.(res))
      .catch(() => {/* Non-critical */});
  }, [forceFailSignal, mode, onQuizSubmit, paperId, questions.length, showResults]);

  const updateMix = (level: DifficultyKey, value: number) => {
    setDifficultyMix((prev) => {
      if (prev[level] === value) return prev;
      return { ...prev, [level]: Math.max(0, Math.min(MAX_PER_LEVEL, value)) };
    });
  };

  const adjustMix = (level: DifficultyKey, delta: number) =>
    updateMix(level, difficultyMix[level] + delta);

  const resetMix = () => setDifficultyMix(DEFAULT_MIX);

  const handleGenerate = async () => {
    if (totalsInvalid) {
      setError(`Choose between 1 and ${MAX_TOTAL_QUESTIONS} total questions.`);
      return;
    }

    setIsGenerating(true);
    setError(null);
    setShowResults(false);
    setIsDemo(false);
    setForcedFailureMessage(null);
    lastHandledForceFailSignal.current = forceFailSignal;

    try {
      const quiz = await generateQuizFromText(paper.title, paper.fullText, difficultyMix);
      setQuestions(quiz);

      const resetSelections = Object.fromEntries(quiz.map((q) => [q.id, null]));
      setChoices(resetSelections);
    } catch (err) {
      // Fall back to demo quiz on quota / API errors
      const msg = err instanceof Error ? err.message : 'Quiz generation failed.';
      const isQuota = msg.toLowerCase().includes('quota') || msg.includes('429') || msg.toLowerCase().includes('rate');
      if (isQuota || true) {
        // Always show demo on any generation failure so users can still practise
        setIsDemo(true);
        setQuestions(DEMO_QUIZ);
        setChoices(Object.fromEntries(DEMO_QUIZ.map((q) => [q.id, null])));
        setError(null);
      } else {
        setQuestions([]);
        setChoices({});
        setError(msg);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelect = (questionId: string, optionIndex: number) => {
    if (showResults) return;
    setChoices((prev) => ({ ...prev, [questionId]: optionIndex }));
  };

  const handleSubmit = async () => {
    setShowResults(true);
    const correct = questions.reduce(
      (acc, q) => (choices[q.id] === q.answerIndex ? acc + 1 : acc),
      0
    );
    // Save quiz result for mastery tracking; pass result so parent can auto-mark mastered
    submitQuizResult(paperId, correct, questions.length)
      .then((res) => onQuizSubmit?.(res))
      .catch(() => {/* Non-critical */});
  };

  const score = showResults
    ? questions.reduce((acc, q) => (choices[q.id] === q.answerIndex ? acc + 1 : acc), 0)
    : 0;

  return (
    <section className={mode === 'closed' ? 'mx-auto w-full max-w-5xl' : 'w-full'}>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <BookOpenIcon className="mt-1 h-5 w-5 shrink-0 text-[var(--primary)]" />
          <div>
            <h2 className="text-xl font-bold text-[var(--text)] font-display">Comprehension Quiz</h2>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              {mode === 'closed'
                ? 'Closed-book mode. Once questions begin, leaving the quiz counts as a failed attempt.'
                : 'Test your understanding with AI-generated questions from this paper.'}
            </p>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating || totalsInvalid}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 self-start rounded-lg px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 md:self-auto"
          style={{ background: 'var(--gradient-primary)' }}
        >
          {isGenerating ? (
            <>
              <LoaderIcon className="w-5 h-5 animate-spin" />
              Generating...
            </>
          ) : (
            'Generate Quiz'
          )}
        </button>
      </div>

      <div className="mb-8 border-y border-[var(--border)]/70 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold text-[var(--text)]">Difficulty mix</h3>
          <button
            type="button"
            onClick={resetMix}
            disabled={isGenerating}
            className="text-sm text-[var(--primary)] hover:opacity-80 disabled:opacity-40 transition-opacity"
          >
            Reset
          </button>
        </div>

        <div className="divide-y divide-[var(--border)]/70">
          {(Object.keys(difficultyMeta) as DifficultyKey[]).map((level) => {
            const meta = difficultyMeta[level];
            return (
              <div
                key={level}
                className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{meta.label}</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{meta.description}</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => adjustMix(level, -1)}
                    disabled={difficultyMix[level] === 0 || isGenerating}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border text-[var(--text)] disabled:opacity-40 transition-colors"
                    style={{ borderColor: 'rgba(148, 163, 184, 0.18)', background: 'transparent' }}
                    aria-label={`Decrease ${meta.label}`}
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-2xl font-semibold text-[var(--text)]">
                    {difficultyMix[level]}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustMix(level, 1)}
                    disabled={difficultyMix[level] >= MAX_PER_LEVEL || isGenerating}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border text-[var(--text)] disabled:opacity-40 transition-colors"
                    style={{ borderColor: 'rgba(148, 163, 184, 0.18)', background: 'transparent' }}
                    aria-label={`Increase ${meta.label}`}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Total questions requested: {totalRequested} / {MAX_TOTAL_QUESTIONS}
        </p>
        {totalsInvalid && (
          <p className="mt-2 text-sm text-amber-500">
            Select between 1 and {MAX_TOTAL_QUESTIONS} questions in total.
          </p>
        )}
      </div>

      {error && (
        <p className="mb-4 border-l-2 border-red-400 pl-3 text-sm text-red-500">{error}</p>
      )}

      {forcedFailureMessage && (
        <p className="mb-4 border-l-2 border-red-400 pl-3 text-sm text-red-500">
          {forcedFailureMessage}
        </p>
      )}

      {questions.length === 0 && !isGenerating && !error && (
        <p className="text-[var(--text-muted)]">
          Choose your difficulty mix, then press Generate Quiz to build questions from this paper.
        </p>
      )}

      {isDemo && questions.length > 0 && (
        <div className="mb-4 border-l-2 border-amber-500 pl-3 text-sm font-medium text-amber-600">
          Demo quiz — AI quota exceeded. These are sample questions to keep you practising.
          Your answers still count toward mastery progress.
        </div>
      )}

      {questions.length > 0 && (
        <div className="space-y-6">
          {questions.map((question, idx) => {
            const selected = choices[question.id];
            const meta = difficultyMeta[question.difficulty];

            return (
              <div key={question.id} className="border-t border-[var(--border)]/70 pt-6">
                <header className="mb-4 flex flex-wrap items-start gap-3">
                  <div>
                    <p className="text-sm text-[var(--primary)] font-semibold">Question {idx + 1}</p>
                    <h3 className="text-lg text-[var(--text)] font-medium">{question.question}</h3>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.badgeBg}`} style={meta.badgeStyle}>
                    {meta.label}
                  </span>
                </header>

                <div className="divide-y divide-[var(--border)]/60">
                  {question.options.map((option, optionIdx) => {
                    const isSelected = selected === optionIdx;
                    const isCorrect = question.answerIndex === optionIdx;
                    const reveal = showResults && (isCorrect || isSelected);
                    let stateClasses = 'text-[var(--text)] hover:text-[var(--primary)]';
                    let optionStyle: React.CSSProperties = {};

                    if (reveal) {
                      stateClasses = isCorrect
                        ? 'text-green-600'
                        : 'text-red-500';
                      optionStyle = {
                        background: isCorrect ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                      };
                    } else if (isSelected) {
                      stateClasses = 'text-[var(--primary)]';
                      optionStyle = { background: 'rgba(79, 70, 229, 0.08)' };
                    }

                    return (
                      <button
                        key={optionIdx}
                        onClick={() => handleSelect(question.id, optionIdx)}
                        className={`w-full text-left px-3 py-3 transition-colors ${stateClasses}`}
                        style={optionStyle}
                        disabled={showResults}
                      >
                        <span className="font-semibold text-[var(--primary)] mr-3">
                          {String.fromCharCode(65 + optionIdx)}.
                        </span>
                        <span className="text-[var(--text)]">{option}</span>
                      </button>
                    );
                  })}
                </div>

                {showResults && (
                  <footer className="mt-4 border-t border-[var(--border)]/60 pt-4 text-sm text-[var(--text-muted)]">
                    {selected === question.answerIndex ? (
                      <span className="font-semibold text-green-500">Correct!</span>
                    ) : (
                      <span className="font-semibold text-red-400">
                        Not quite. Correct answer:{' '}
                        {String.fromCharCode(65 + question.answerIndex)}.
                      </span>
                    )}
                    {question.explanation && (
                      <p className="mt-2 text-[var(--text-muted)]">{question.explanation}</p>
                    )}
                  </footer>
                )}
              </div>
            );
          })}

          {!showResults ? (
            <button
              onClick={handleSubmit}
              disabled={Object.values(choices).some((v) => v === null)}
              className="inline-flex items-center rounded-full bg-green-600 px-6 py-2.5 font-semibold text-white transition-all hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Check Answers
            </button>
          ) : (
            <div className="border-t border-[var(--border)]/70 pt-4 text-[var(--text)]">
              You scored {score} / {questions.length}.
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default QuizSection;
