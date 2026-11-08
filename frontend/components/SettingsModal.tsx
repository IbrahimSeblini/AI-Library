import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';
import { useAccent } from '../contexts/AccentContext';
import { useUIPreferences } from '../contexts/UIPreferencesContext';
import { ACCENT_COLORS } from '../lib/accentColors';
import { updateProfile } from '../services/apiService';
import { User } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onUserUpdate: (u: User) => void;
  onOpenGuide: () => void;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
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
const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);
const BookIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
  </svg>
);
const EyeOffIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
);

// ── Toggle pill ───────────────────────────────────────────────────────────────

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={value}
    onClick={() => onChange(!value)}
    className={`relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-1 ${value ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`}
  >
    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
);

// ── Section header ─────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-3">{label}</p>
);

// ── Row ────────────────────────────────────────────────────────────────────────

const Row: React.FC<{ icon: React.ReactNode; label: string; sub?: string; right: React.ReactNode }> = ({ icon, label, sub, right }) => (
  <div className="flex items-center justify-between gap-4 py-2.5">
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-[var(--primary)] flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text)] leading-tight">{label}</p>
        {sub && <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-tight">{sub}</p>}
      </div>
    </div>
    <div className="flex-shrink-0">{right}</div>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────

const WEEKLY_GOAL_KEY = 'mylibrary_weekly_goal_hours';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, user, onUserUpdate, onOpenGuide }) => {
  const { theme, toggleTheme } = useTheme();
  const { accentId, setAccentId } = useAccent();
  const { showMusicPlayer, setShowMusicPlayer, showChatNav, setShowChatNav } = useUIPreferences();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Weekly goal
  const [goalInput, setGoalInput] = useState<string>(() => {
    try { const v = localStorage.getItem(WEEKLY_GOAL_KEY); return v ?? ''; } catch { return ''; }
  });
  const handleGoalSave = () => {
    const h = parseInt(goalInput, 10);
    if (h > 0 && h < 168) { localStorage.setItem(WEEKLY_GOAL_KEY, String(h)); window.dispatchEvent(new Event('storage')); }
    else if (!goalInput.trim()) { localStorage.removeItem(WEEKLY_GOAL_KEY); window.dispatchEvent(new Event('storage')); }
  };

  // Profile state
  const [displayName, setDisplayName] = useState(user?.name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameError, setNameError] = useState('');

  // Password state
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState('');

  // Sync name when user changes
  useEffect(() => { setDisplayName(user?.name ?? ''); }, [user?.name]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === user?.name) return;
    setNameSaving(true); setNameError(''); setNameSuccess(false);
    try {
      const updated = await updateProfile({ full_name: trimmed });
      onUserUpdate(updated);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 2500);
    } catch (e: any) {
      setNameError(e?.message || 'Failed to save');
    } finally {
      setNameSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPwError(''); setPwSuccess(false);
    if (!currentPw || !newPw) { setPwError('All fields are required'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return; }
    setPwSaving(true);
    try {
      await updateProfile({ current_password: currentPw, new_password: newPw });
      setPwSuccess(true);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => { setPwSuccess(false); setPwOpen(false); }, 2500);
    } catch (e: any) {
      setPwError(e?.message || 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  const nameChanged = displayName.trim() !== (user?.name ?? '');

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            ref={overlayRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.97 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md z-50 flex flex-col bg-[var(--surface)] shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
              <h2 className="text-lg font-bold text-[var(--text)] font-display">Settings</h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

              {/* ── Profile ── */}
              <section>
                <SectionHeader label="Profile" />

                {/* Avatar + email */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0"
                    style={{ background: 'var(--gradient-primary)' }}>
                    {(user?.name ?? '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)] truncate">{user?.name}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{user?.email}</p>
                  </div>
                </div>

                {/* Display name */}
                <div className="mb-3">
                  <label className="text-xs font-medium text-[var(--text-muted)] mb-1.5 block">Display name</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => { setDisplayName(e.target.value); setNameError(''); setNameSuccess(false); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
                      className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)] transition"
                      placeholder="Your name"
                    />
                    <button
                      type="button"
                      onClick={handleSaveName}
                      disabled={!nameChanged || nameSaving}
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--primary)] text-white disabled:opacity-40 hover:opacity-90 transition"
                    >
                      {nameSaving ? '…' : nameSuccess ? 'Saved!' : 'Save'}
                    </button>
                  </div>
                  {nameError && <p className="mt-1.5 text-xs text-[var(--danger)]">{nameError}</p>}
                </div>

                {/* Change password */}
                <button
                  type="button"
                  onClick={() => { setPwOpen((o) => !o); setPwError(''); setPwSuccess(false); }}
                  className="text-xs font-semibold text-[var(--primary)] hover:underline"
                >
                  {pwOpen ? 'Cancel password change' : 'Change password'}
                </button>

                <AnimatePresence>
                  {pwOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 space-y-2">
                        {(['Current password', 'New password', 'Confirm new password'] as const).map((label, i) => {
                          const vals = [currentPw, newPw, confirmPw];
                          const setters = [setCurrentPw, setNewPw, setConfirmPw];
                          return (
                            <input
                              key={i}
                              type="password"
                              placeholder={label}
                              value={vals[i]}
                              onChange={(e) => { setters[i](e.target.value); setPwError(''); }}
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)] transition"
                            />
                          );
                        })}
                        {pwError && <p className="text-xs text-[var(--danger)]">{pwError}</p>}
                        {pwSuccess && <p className="text-xs text-[var(--success)]">Password changed successfully!</p>}
                        <button
                          type="button"
                          onClick={handleChangePassword}
                          disabled={pwSaving}
                          className="w-full py-2 rounded-xl text-sm font-semibold bg-[var(--primary)] text-white disabled:opacity-50 hover:opacity-90 transition"
                        >
                          {pwSaving ? 'Saving…' : 'Update password'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              <div className="border-t border-[var(--border)]" />

              {/* ── Appearance ── */}
              <section>
                <SectionHeader label="Appearance" />
                <Row
                  icon={theme === 'dark' ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
                  label={theme === 'dark' ? 'Dark mode' : 'Light mode'}
                  sub="Toggle between light and dark"
                  right={<Toggle value={theme === 'dark'} onChange={() => toggleTheme()} />}
                />

                <div className="mt-3">
                  <p className="text-xs font-medium text-[var(--text-muted)] mb-2.5">Accent color</p>
                  <div className="grid grid-cols-5 gap-2.5">
                    {ACCENT_COLORS.map((color) => (
                      <button
                        key={color.id}
                        type="button"
                        title={color.label}
                        onClick={() => setAccentId(color.id)}
                        className="relative flex items-center justify-center w-10 h-10 rounded-xl transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--primary)]"
                        style={{ backgroundColor: color.swatch }}
                      >
                        {accentId === color.id && <CheckIcon className="w-4 h-4 text-white drop-shadow" />}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-muted)] capitalize">
                    {ACCENT_COLORS.find((c) => c.id === accentId)?.label ?? 'Indigo'} accent
                  </p>
                </div>
              </section>

              <div className="border-t border-[var(--border)]" />

              {/* ── Interface ── */}
              <section>
                <SectionHeader label="Interface" />

                <Row
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  }
                  label="Music player"
                  sub="Show relaxing sounds button"
                  right={<Toggle value={showMusicPlayer} onChange={setShowMusicPlayer} />}
                />

                <Row
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  }
                  label="Chat (AI Librarian)"
                  sub="Show Chat in navigation bar"
                  right={<Toggle value={showChatNav} onChange={setShowChatNav} />}
                />
              </section>

              <div className="border-t border-[var(--border)]" />

              {/* ── Study ── */}
              <section>
                <SectionHeader label="Study" />
                <Row
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                  label="Weekly study goal"
                  sub="Hours per week shown in Tracker"
                  right={
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={167}
                        value={goalInput}
                        onChange={(e) => setGoalInput(e.target.value)}
                        onBlur={handleGoalSave}
                        onKeyDown={(e) => { if (e.key === 'Enter') { handleGoalSave(); (e.target as HTMLInputElement).blur(); } }}
                        placeholder="—"
                        className="w-16 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 text-sm text-[var(--text)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)] transition"
                      />
                      <span className="text-xs text-[var(--text-muted)]">h/wk</span>
                    </div>
                  }
                />
              </section>

              <div className="border-t border-[var(--border)]" />

              {/* ── Help ── */}
              <section>
                <SectionHeader label="Help" />
                <button
                  type="button"
                  onClick={() => { onOpenGuide(); onClose(); }}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors text-left"
                >
                  <BookIcon className="w-4 h-4 text-[var(--primary)] flex-shrink-0" />
                  Open app guide
                </button>
              </section>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
