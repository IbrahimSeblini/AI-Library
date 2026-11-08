import React, { useMemo, useState, useEffect } from 'react';
import type { ReadAloudSource } from '../types';
import { buildParagraphSegments } from '../services/textChunker';
import { extractTextFromFile } from '../services/fileExtractors';
import { useReadAloud } from '../hooks/useReadAloud';
import ReadAloudReader from './ReadAloudReader';

interface ReadAloudExperienceProps {
  bookId: string;
  title: string;
  text: string;
  /** Compact mode: renders only the inline controls bar, no text reader, no section wrapper */
  compact?: boolean;
}

const RATE_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

const ReadAloudExperience: React.FC<ReadAloudExperienceProps> = ({ bookId, title, text, compact = false }) => {
  const [source, setSource] = useState<ReadAloudSource>({ text, label: 'Paper text' });
  const [fileStatus, setFileStatus] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  useEffect(() => {
    setSource({ text, label: 'Paper text' });
  }, [text, bookId]);

  const paragraphs = useMemo(() => buildParagraphSegments(source.text), [source.text]);
  const controller = useReadAloud(bookId, paragraphs);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoadingFile(true);
    setFileStatus(null);
    try {
      const extracted = await extractTextFromFile(file);
      if (!extracted.text.trim()) {
        throw new Error('No text could be extracted from that file.');
      }
      setSource(extracted);
      setFileStatus(`Loaded ${extracted.label}`);
    } catch (error) {
      setFileStatus(error instanceof Error ? error.message : 'Unable to load that file.');
    } finally {
      setIsLoadingFile(false);
      event.target.value = '';
    }
  };

  const handleKeyShortcuts = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      controller.stop();
      return;
    }
    if (event.altKey && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      controller.resume();
      return;
    }
    if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault();
      controller.next();
      return;
    }
    if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      controller.previous();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      if (controller.isPlaying && !controller.isPaused) {
        controller.pause();
      } else if (controller.isPaused) {
        controller.resume();
      } else {
        controller.play();
      }
    }
  };

  const isActive = controller.isPlaying || controller.isPaused;

  if (compact) {
    return (
      <div
        className="flex flex-wrap items-center gap-3"
        role="region"
        aria-label="Read aloud controls"
        tabIndex={0}
        onKeyDown={handleKeyShortcuts}
      >
        {/* Primary play/pause/resume button */}
        <button
          type="button"
          onClick={
            isActive && !controller.isPaused
              ? controller.pause
              : controller.isPaused
              ? controller.resume
              : controller.play
          }
          disabled={!controller.isSupported}
          aria-label={isActive && !controller.isPaused ? "Pause" : controller.isPaused ? "Resume" : "Play"}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ background: "var(--gradient-primary)", boxShadow: isActive && !controller.isPaused ? "none" : "var(--glow-primary)" }}
        >
          {isActive && !controller.isPaused ? (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          )}
          {isActive && !controller.isPaused ? "Pause" : controller.isPaused ? "Resume" : "Play"}
        </button>

        {/* Stop / Prev / Next — icon-only, minimal */}
        {isActive && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={controller.previous} disabled={!controller.isSupported} title="Previous (Alt+←)"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-40">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button type="button" onClick={controller.next} disabled={!controller.isSupported} title="Next (Alt+→)"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-40">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button type="button" onClick={controller.stop} disabled={!controller.isSupported} title="Stop"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-40">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="h-4 w-px rounded-full" style={{ background: "var(--border)" }} />

        {/* Voice select — minimal */}
        <select
          className="max-w-[160px] rounded-lg px-2.5 py-1.5 text-sm text-[var(--text)] bg-transparent border-0 outline-none cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors"
          value={controller.selectedVoiceId ?? ''}
          onChange={(e) => controller.setSelectedVoiceId(e.target.value)}
          disabled={!controller.isSupported || controller.voices.length === 0}
          aria-label="Select voice"
        >
          {controller.voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          {!controller.voices.length && <option value="">No voices</option>}
        </select>

        {/* Speed select — minimal */}
        <select
          className="w-16 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text)] bg-transparent border-0 outline-none cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors"
          value={controller.rate}
          onChange={(e) => controller.setRate(Number(e.target.value))}
          aria-label="Playback speed"
        >
          {RATE_OPTIONS.map((v) => <option key={v} value={v}>{v}x</option>)}
        </select>

        {controller.status && (
          <span className="text-xs text-[var(--text-muted)] truncate max-w-[200px]" aria-live="polite">
            {controller.status}
          </span>
        )}
      </div>
    );
  }

  return (
    <section
      className="bg-[var(--bg-secondary)]/60 border border-[var(--border)] rounded-xl p-6"
      role="region"
      aria-label="Read aloud controls"
      tabIndex={0}
      onKeyDown={handleKeyShortcuts}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text)]">Read Aloud</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Source: {source.label}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={isActive && !controller.isPaused ? controller.pause : controller.isPaused ? controller.resume : controller.play}
            disabled={!controller.isSupported}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: "var(--gradient-primary)" }}
          >
            {isActive && !controller.isPaused ? "Pause" : controller.isPaused ? "Resume" : "Play Audio"}
          </button>
          <button
            type="button"
            onClick={controller.stop}
            disabled={!controller.isSupported}
            aria-label="Stop"
            aria-keyshortcuts="Alt+S"
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-red-600/80 text-[var(--text)] hover:text-white border border-[var(--border)] text-sm font-medium disabled:opacity-50 transition-colors"
          >
            ⏹ Stop
          </button>
          <button
            type="button"
            onClick={controller.previous}
            disabled={!controller.isSupported}
            aria-label="Previous sentence"
            aria-keyshortcuts="Alt+ArrowLeft"
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text)] border border-[var(--border)] text-sm disabled:opacity-50 transition-colors"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={controller.next}
            disabled={!controller.isSupported}
            aria-label="Next sentence"
            aria-keyshortcuts="Alt+ArrowRight"
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text)] border border-[var(--border)] text-sm disabled:opacity-50 transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="text-sm text-[var(--text-muted)] flex flex-col gap-2">
          Voice / Language
          <select
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)]"
            value={controller.selectedVoiceId ?? ''}
            onChange={(event) => controller.setSelectedVoiceId(event.target.value)}
            disabled={!controller.isSupported || controller.voices.length === 0}
            aria-label="Select voice"
          >
            {controller.voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} ({voice.lang})
              </option>
            ))}
            {!controller.voices.length && <option value="">No voices available</option>}
          </select>
        </label>

        <label className="text-sm text-[var(--text-muted)] flex flex-col gap-2">
          Speed
          <select
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)]"
            value={controller.rate}
            onChange={(event) => controller.setRate(Number(event.target.value))}
            aria-label="Playback speed"
          >
            {RATE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}x
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-[var(--text-muted)] flex flex-col gap-2">
          Load TXT / PDF / EPUB
          <input
            type="file"
            accept=".txt,.pdf,.epub,application/pdf,text/plain"
            className="text-sm text-[var(--text-muted)]"
            onChange={handleFileChange}
            aria-label="Upload a file to read"
          />
        </label>
      </div>

      <div className="mt-3 text-xs text-[var(--text-muted)]" aria-live="polite">
        {controller.status}
        {isLoadingFile ? ' Loading file...' : ''}
        {fileStatus ? ` ${fileStatus}` : ''}
      </div>

      <div className="mt-6 border-t border-[var(--border)] pt-4">
        <ReadAloudReader
          paragraphs={paragraphs}
          currentPosition={controller.currentPosition}
          onJumpTo={(position) => controller.jumpTo(position, controller.isPlaying && !controller.isPaused)}
        />
      </div>
    </section>
  );
};

export default ReadAloudExperience;
