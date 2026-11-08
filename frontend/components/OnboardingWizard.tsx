import React, { useEffect, useMemo, useState } from 'react';
import type { View } from '../App';
import { BookOpenIcon } from './icons/BookOpenIcon';
import RoadmapIcon from './icons/RoadmapIcon';
import { XIcon } from './icons/XIcon';
import { QuestionCircleIcon } from './icons/QuestionCircleIcon';
import { HomeIcon } from './icons/HomeIcon';
import { HighlighterIcon } from './icons/HighlighterIcon';
import { PencilIcon } from './icons/PencilIcon';
import { PenLineIcon } from './icons/PenLineIcon';
import { MessageSquareIcon } from './icons/MessageSquareIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { GroupsIcon } from './icons/GroupsIcon';
import { UserCheckIcon } from './icons/UserCheckIcon';

interface Feature { label: string; text: string }

interface Step {
  eyebrow: string;
  title: string;
  description: string;
  features: Feature[];
  icon: React.ReactNode;
  ctaLabel: string;
  target: View;
}

interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: View) => void;
  userName?: string;
}

const GearIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ isOpen, onClose, onNavigate, userName }) => {
  const steps: Step[] = useMemo(() => [
    {
      eyebrow: 'Welcome',
      title: `Everything you need to research smarter`,
      description: `MyLibraryPal is your all-in-one research companion — it connects your papers, highlights, notes, and ideas into a single workspace. This guide walks through every feature so you know exactly what's available.`,
      features: [
        { label: 'Your library', text: 'Every paper you save becomes searchable, highlightable, annotatable, and analyzable — all in one place.' },
        { label: 'AI built-in', text: 'Summarize, paraphrase, challenge arguments, and ask your librarian questions — all grounded in your own papers.' },
        { label: 'Progress tools', text: 'A knowledge roadmap, study planner, time tracker, and reading speed meter help you build consistent research habits.' },
      ],
      icon: <QuestionCircleIcon className="h-5 w-5" />,
      ctaLabel: 'Go to Home',
      target: { name: 'home' } as View,
    },
    {
      eyebrow: 'Home',
      title: 'Your research dashboard',
      description: 'Home is designed to get you back into your work instantly. It shows what you were reading, surfaces highlights you made, recommends new papers based on your mastery levels, and shows today\'s study tasks.',
      features: [
        { label: 'Continue Reading', text: 'A horizontal shelf of your recent papers — click any card to pick up exactly where you left off.' },
        { label: 'Recent Highlights', text: 'Your latest highlights from any paper appear here as compact chips. Click one to jump straight to that passage.' },
        { label: 'Today\'s Tasks', text: 'If you have an active study plan, today\'s scheduled tasks and friend reading activity appear side-by-side at the bottom.' },
      ],
      icon: <HomeIcon className="h-5 w-5" />,
      ctaLabel: 'Go to Home',
      target: { name: 'home' } as View,
    },
    {
      eyebrow: 'Readings',
      title: 'Your library, highlights, and notes',
      description: 'The Readings page has three sections: your full paper library, all your highlights grouped by color, and all your notes. Click a card to open that section — click again to collapse it.',
      features: [
        { label: 'My Readings', text: 'Browse all saved papers. Filter by subject, author, year range, or keyword. A mastery checkmark shows which papers you\'ve fully engaged with.' },
        { label: 'My Highlights', text: 'All highlights across every paper, grouped by color. Filter to one or more colors. Each color group can be AI-summarized into a short thematic overview.' },
        { label: 'My Notes', text: 'All your notes in one place. Filter by paper using the search dropdown. Notes linked to a specific passage show the passage context alongside.' },
      ],
      icon: <BookOpenIcon className="h-5 w-5" />,
      ctaLabel: 'Go to Readings',
      target: { name: 'readings' } as View,
    },
    {
      eyebrow: 'Reading a Paper',
      title: 'Immersive reading with live tools',
      description: 'Open any paper from Home or Readings to enter the reading view. The layout is clean and distraction-free, with all tools one click away. Everything you do — highlights, notes, time — is tracked automatically.',
      features: [
        { label: 'Color highlights', text: 'Select any text and choose a highlight color. Yellow, green, blue, pink, and more — use colors to categorize ideas as you read.' },
        { label: 'Highlights side panel', text: 'A collapsible right panel shows all highlights for the current paper grouped by color, with AI-generated titles. Click any highlight to jump to it.' },
        { label: 'Summarize, Paraphrase, Challenge', text: 'Select text (or use the whole paper) then click Summarize, Paraphrase, or Challenge. Challenge opens a debate coach that generates counterarguments and probing questions.' },
      ],
      icon: <HighlighterIcon className="h-5 w-5" />,
      ctaLabel: 'Go to Readings',
      target: { name: 'readings', tab: 'papers' } as View,
    },
    {
      eyebrow: 'Writings',
      title: 'AI writing tools in one place',
      description: 'The Writings page has three tools accessible as cards. Click a card to expand that tool below. Each tool works standalone — paste any text — or accepts text sent from a paper you\'re reading.',
      features: [
        { label: 'Summarize', text: 'Paste text or send a full paper. Choose short, medium, or long output. The summary preserves structure with headings and bullets where relevant.' },
        { label: 'Paraphrase', text: 'Rewrite any text in different words while preserving meaning. Useful for understanding dense passages or reformulating ideas in your own voice.' },
        { label: 'Plagiarism Check', text: 'Paste your essay text and run it against your saved library. The checker scores originality and flags which passages are similar to papers you have.' },
      ],
      icon: <PenLineIcon className="h-5 w-5" />,
      ctaLabel: 'Go to Writings',
      target: { name: 'writings' } as View,
    },
    {
      eyebrow: 'AI Librarian',
      title: 'Ask questions grounded in your papers',
      description: 'The Chat page is your conversational research assistant. Every answer is grounded in your saved library — not the internet. Ask anything from "summarize what I know about X" to "which papers discuss Y together".',
      features: [
        { label: 'Conversation history', text: 'Past conversations appear in the left sidebar. Click any thread to continue it, or start fresh with the new chat button at the top.' },
        { label: 'Cited sources', text: 'Answers show which papers they drew from as compact inline links. Click a source link to open that paper directly.' },
        { label: 'Suggested prompts', text: 'The empty chat state shows suggested prompts to help you get started — search, comparison, synthesis, and highlight-based questions.' },
      ],
      icon: <MessageSquareIcon className="h-5 w-5" />,
      ctaLabel: 'Go to Chat',
      target: { name: 'chat' } as View,
    },
    {
      eyebrow: 'Roadmap',
      title: 'Your personal knowledge graph',
      description: 'The Roadmap analyzes every paper in your library and extracts concepts, their relationships, and your mastery of each. It builds a visual graph showing how your knowledge connects — and what\'s still unexplored.',
      features: [
        { label: 'Knowledge graph', text: 'Concepts appear as nodes sized by importance. Lines show relationships. Node color indicates mastery: discovered → reading → engaged → mastered.' },
        { label: 'List view', text: 'Switch to List view for a table of all concepts sortable by mastery, name, or type. Click a paper link to open it directly.' },
        { label: 'Study plan', text: 'Generate a day-by-day study plan from your roadmap. It schedules reading, concept review, and quizzes based on your mastery gaps and weekly hour goal.' },
      ],
      icon: <RoadmapIcon className="h-5 w-5" />,
      ctaLabel: 'Go to Roadmap',
      target: { name: 'roadmap' } as View,
    },
    {
      eyebrow: 'Tracker',
      title: 'Measure your study habits',
      description: 'The Study Tracker records every session automatically — no manual logging. Any time you\'re on a page, the clock is running. Sessions are capped at 4 hours so crashes don\'t inflate your stats.',
      features: [
        { label: 'Weekly overview', text: 'A bar chart breaks down your week by day. Below it, you see time split by activity type (reading, chat, writings, groups) and by subject.' },
        { label: 'Reading speed', text: 'Your WPM is computed from real reading sessions — time spent on a paper divided by its word count. Shown at the top of the tracker once you have enough sessions.' },
        { label: 'Weekly goal & streak', text: 'Set your weekly hour goal in Settings. A progress bar shows how far you\'ve come. Your daily streak counts consecutive days with at least one session.' },
      ],
      icon: <HistoryIcon className="h-5 w-5" />,
      ctaLabel: 'Go to Tracker',
      target: { name: 'studytracker' } as View,
    },
    {
      eyebrow: 'Groups',
      title: 'Collaborate and organize with sections',
      description: 'Study Groups let you share papers, notes, and discussions with others. Your own groups can be organized into custom sections — drag any group card into a section to file it.',
      features: [
        { label: 'Sections', text: 'Click "Add section" to create named categories (e.g. "AI Research", "History"). Drag group cards between sections to organize. Rename a section by clicking its label.' },
        { label: 'Section filter', text: 'Filter pills above My Groups let you see only one section at a time — useful when you\'re in many groups across different topics.' },
        { label: 'Public & private groups', text: 'Create public groups that anyone can discover and join, or private groups by invitation only. Pending invitations appear at the top with Accept / Decline buttons.' },
      ],
      icon: <GroupsIcon className="h-5 w-5" />,
      ctaLabel: 'Go to Groups',
      target: { name: 'groups' } as View,
    },
    {
      eyebrow: 'Friends & Settings',
      title: 'Your network and preferences',
      description: 'The Friends page shows your research network\'s reading activity — who\'s reading what and in which subjects. Settings lets you personalize the app\'s look and behavior without leaving your flow.',
      features: [
        { label: 'Friends activity', text: 'See which subjects your friends are spending time in this week, and their current reading streaks. Send friend requests by searching by name or email.' },
        { label: 'Appearance & interface', text: 'Settings (gear icon, top right) offers dark/light mode, 10 accent colors, a music player toggle for ambient sounds, and a Chat nav toggle.' },
        { label: 'Weekly goal', text: 'Set your study goal in Settings → Study. The hours-per-week value drives the Tracker progress bar and informs how your Roadmap study plan schedules tasks.' },
      ],
      icon: <UserCheckIcon className="h-5 w-5" />,
      ctaLabel: 'Go to Friends',
      target: { name: 'friends' } as View,
    },
  ], [userName]);

  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (isOpen) setStepIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setStepIndex((c) => Math.min(c + 1, steps.length - 1));
      if (event.key === 'ArrowLeft') setStepIndex((c) => Math.max(c - 1, 0));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, steps.length]);

  if (!isOpen) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="grid h-[min(90vh,800px)] w-full max-w-6xl grid-cols-1 overflow-hidden rounded-[32px] border border-white/10 bg-[var(--surface)] shadow-2xl lg:grid-cols-[260px_minmax(0,1fr)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Sidebar ── */}
        <aside className="flex flex-col border-b border-[var(--border)]/70 bg-[linear-gradient(180deg,rgba(79,70,229,0.14),rgba(15,23,42,0.01))] p-5 lg:border-b-0 lg:border-r overflow-y-auto">
          <div className="flex items-center justify-between mb-6 flex-shrink-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              <QuestionCircleIcon className="h-3.5 w-3.5" />
              App Guide
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <nav className="space-y-1 flex-1">
            {steps.map((item, index) => {
              const active = index === stepIndex;
              const done = index < stepIndex;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setStepIndex(index)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                  style={{
                    background: active ? 'var(--primary-light)' : 'transparent',
                    color: active ? 'var(--text)' : 'var(--text-muted)',
                    border: active ? '1px solid color-mix(in srgb, var(--primary) 20%, transparent)' : '1px solid transparent',
                  }}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    active ? 'bg-[var(--primary)] text-white' : done ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : 'bg-white/8 text-[var(--text-muted)]'
                  }`}>
                    {done ? (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <span>{item.icon}</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">{item.eyebrow}</span>
                    <span className="mt-0.5 block text-xs font-semibold leading-tight">{item.title}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="mt-4 flex-shrink-0 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-[var(--text-muted)]">
            Press <span className="font-bold text-[var(--text)]">?</span> anytime · Arrow keys to navigate
          </div>
        </aside>

        {/* ── Main content ── */}
        <section className="flex min-h-0 flex-col p-6 md:p-8 overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">{step.eyebrow}</span>
                <span className="text-[var(--border)]">·</span>
                <span className="text-[11px] text-[var(--text-muted)]">{stepIndex + 1} of {steps.length}</span>
              </div>
              <h2 className="text-2xl font-extrabold leading-tight text-[var(--text)] font-display md:text-3xl">
                {step.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)] max-w-2xl">
                {step.description}
              </p>
            </div>
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(79,70,229,0.18),rgba(99,102,241,0.06))] text-[var(--primary)] md:flex">
              {step.icon}
            </div>
          </div>

          {/* Feature cards */}
          <div className="grid gap-3 md:grid-cols-3 flex-1">
            {step.features.map((f) => (
              <div
                key={f.label}
                className="rounded-2xl border border-[var(--border)]/70 bg-[var(--bg-secondary)]/40 p-5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] flex-shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">{f.label}</span>
                </div>
                <p className="text-sm leading-relaxed text-[var(--text)]">{f.text}</p>
              </div>
            ))}
          </div>

          {/* Progress + navigation */}
          <div className="pt-6 flex-shrink-0">
            {/* Progress bar */}
            <div className="flex items-center gap-1.5 mb-5">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStepIndex(i)}
                  className="h-1.5 rounded-full transition-all duration-300 hover:opacity-80"
                  style={{
                    width: i === stepIndex ? 36 : 10,
                    background: i <= stepIndex ? 'var(--primary)' : 'rgba(148,163,184,0.2)',
                  }}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStepIndex((c) => Math.max(c - 1, 0))}
                disabled={stepIndex === 0}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text)] disabled:opacity-30"
              >
                Previous
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => { onNavigate(step.target); onClose(); }}
                  className="rounded-full border border-[var(--border)] bg-[var(--bg-secondary)]/50 px-4 py-2 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  {step.ctaLabel}
                </button>
                <button
                  type="button"
                  onClick={() => isLast ? onClose() : setStepIndex((c) => c + 1)}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--gradient-primary)' }}
                >
                  {isLast ? 'Done' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default OnboardingWizard;
