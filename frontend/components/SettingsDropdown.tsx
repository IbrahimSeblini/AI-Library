import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';
import { useAccent } from '../contexts/AccentContext';
import { ACCENT_COLORS } from '../lib/accentColors';

interface SettingsDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement>;
  onOpenGuide?: () => void;
}

const SunIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const MoonIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);

const BookIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

export const SettingsDropdown: React.FC<SettingsDropdownProps> = ({ isOpen, onClose, anchorRef, onOpenGuide }) => {
  const { theme, toggleTheme } = useTheme();
  const { accentId, setAccentId } = useAccent();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, anchorRef]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Settings</p>
          </div>

          <div className="px-4 pb-4 space-y-5">
            {/* Theme row */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2">Appearance</p>
              <button
                type="button"
                onClick={toggleTheme}
                className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <span className="flex items-center gap-2.5 font-medium">
                  {theme === 'dark' ? (
                    <MoonIcon className="w-4 h-4 text-[var(--primary)]" />
                  ) : (
                    <SunIcon className="w-4 h-4 text-[var(--primary)]" />
                  )}
                  {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                </span>
                {/* Toggle pill */}
                <div
                  className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${
                    theme === 'dark' ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                      theme === 'dark' ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>
            </div>

            {/* Accent color */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2.5">Accent Color</p>
              <div className="grid grid-cols-5 gap-2">
                {ACCENT_COLORS.map((color) => {
                  const isActive = accentId === color.id;
                  return (
                    <button
                      key={color.id}
                      type="button"
                      title={color.label}
                      onClick={() => setAccentId(color.id)}
                      className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--primary)]"
                      style={{ backgroundColor: color.swatch }}
                    >
                      {isActive && (
                        <CheckIcon className="w-4 h-4 text-white drop-shadow" />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-[var(--text-muted)] capitalize">
                {ACCENT_COLORS.find((c) => c.id === accentId)?.label ?? 'Indigo'}
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-[var(--border)]" />

            {/* Guide */}
            <button
              type="button"
              onClick={() => { onOpenGuide?.(); onClose(); }}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <BookIcon className="w-4 h-4 text-[var(--primary)]" />
              Open Guide
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
