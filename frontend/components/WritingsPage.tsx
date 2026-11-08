import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TextSummarizer from './TextSummarizer';
import TextParaphraser from './TextParaphraser';
import PlagiarismChecker from './PlagiarismChecker';
import { FileListIcon } from './icons/FileListIcon';
import { ShuffleIcon } from './icons/ShuffleIcon';
import { ShieldCheckIcon } from './icons/ShieldCheckIcon';

export type WritingsTool = 'summary' | 'paraphrase' | 'check';

interface WritingsPageProps {
  activeTool?: WritingsTool;
  onToolChange: (tool: WritingsTool) => void;
  initialText?: string;
}

const tools: { id: WritingsTool; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'summary',
    label: 'Summarize',
    description: 'Generate AI summaries of papers and text',
    icon: <FileListIcon className="w-7 h-7 text-[var(--primary)]" />,
  },
  {
    id: 'paraphrase',
    label: 'Paraphrase',
    description: 'Rewrite and rephrase text intelligently',
    icon: <ShuffleIcon className="w-7 h-7 text-[var(--primary)]" />,
  },
  {
    id: 'check',
    label: 'Check',
    description: 'Check for plagiarism and writing quality',
    icon: <ShieldCheckIcon className="w-7 h-7 text-[var(--primary)]" />,
  },
];

const WritingsPage: React.FC<WritingsPageProps> = ({ activeTool, onToolChange, initialText }) => {
  const [selected, setSelected] = useState<WritingsTool | undefined>(activeTool);

  // Sync when parent changes the active tool externally (e.g. via navbar deep link)
  useEffect(() => {
    setSelected(activeTool);
  }, [activeTool]);

  const handleCardClick = (id: WritingsTool) => {
    if (selected === id) {
      setSelected(undefined);
    } else {
      setSelected(id);
      onToolChange(id);
    }
  };

  const hasSelection = selected !== undefined;

  return (
    <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10">
      {/* Header + cards: shift to top when a tool is open, else center vertically */}
      <motion.div
        layout
        className={`flex flex-col items-center transition-all ${
          hasSelection ? 'pt-10 pb-6' : 'min-h-[calc(100vh-8rem)] justify-center'
        }`}
      >
        <motion.div layout className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display mb-2">
            Writings
          </h1>
          <p className="text-[var(--text-muted)]">
            Summarize, paraphrase, and check your writing in one place.
          </p>
        </motion.div>

        {/* Tool selector — full cards when idle, compact pill strip when active */}
        {hasSelection ? (
          <motion.div layout className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 w-fit">
            {tools.map((tool) => {
              const isActive = selected === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => handleCardClick(tool.id)}
                  className="rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150"
                  style={isActive
                    ? { background: 'var(--gradient-primary)', color: '#fff' }
                    : { color: 'var(--text-muted)' }
                  }
                >
                  {tool.label}
                </button>
              );
            })}
          </motion.div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-5xl">
            {tools.map((tool) => (
              <motion.button
                key={tool.id}
                type="button"
                layout
                onClick={() => handleCardClick(tool.id)}
                whileHover={{ y: -3, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="text-left rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-6 hover:border-[var(--primary)]/50 hover:bg-[var(--bg-secondary)]/50 transition-colors duration-200"
              >
                <div className="p-3 rounded-xl w-fit mb-3" style={{ background: 'var(--primary-light)' }}>
                  {tool.icon}
                </div>
                <h2 className="text-lg font-bold text-[var(--text)] font-display">{tool.label}</h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">{tool.description}</p>
              </motion.button>
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* Expanding content panel */}
      <AnimatePresence mode="wait">
        {selected && (
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="pb-16"
          >
            {selected === 'summary' && <TextSummarizer initialText={initialText} />}
            {selected === 'paraphrase' && <TextParaphraser initialText={initialText} />}
            {selected === 'check' && <PlagiarismChecker />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WritingsPage;
