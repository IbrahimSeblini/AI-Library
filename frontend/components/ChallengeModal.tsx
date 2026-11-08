import React, { useEffect, useRef, useState } from 'react';
import { generateCounter, type CounterChatMessage } from '../services/counterargumentService';
import { importConversation } from '../services/apiService';
import { queuePreferredLibrarianConversation } from '../lib/librarianConversation';
import { LoaderIcon } from './icons/LoaderIcon';
import { SendIcon } from './icons/SendIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { UserIcon } from './icons/UserIcon';
import { XIcon } from './icons/XIcon';
import FormattedAiText from './ui/FormattedAiText';

const NETWORK_ERROR_HINT =
  "The app can't reach the challenge service right now. Make sure the backend is running and restart it so the new counterarguments service comes up on port 8125.";

interface ConversationMessage extends CounterChatMessage {
  id: string;
  isLoading?: boolean;
}

interface ChallengeModalProps {
  text: string;
  onClose: () => void;
}

const ChallengeModal: React.FC<ChallengeModalProps> = ({ text, onClose }) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSavingToLibrarian, setIsSavingToLibrarian] = useState(false);
  const bootstrappedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const trimmedText = text.trim();
  const excerptPreview = trimmedText.length > 600 ? `${trimmedText.slice(0, 600)}...` : trimmedText;
  const canSaveToLibrarian = messages.some((message) => !message.isLoading && message.role === 'assistant');

  const formatError = (err: unknown, fallback: string): string => {
    if (!(err instanceof Error) || !err.message) return fallback;
    if (
      err.message.includes('Network error') ||
      err.message.includes('Failed to fetch') ||
      err.message.includes('NetworkError')
    ) {
      return NETWORK_ERROR_HINT;
    }
    try {
      const parsed = JSON.parse(err.message) as { detail?: string };
      if (typeof parsed.detail === 'string' && parsed.detail.trim()) {
        return parsed.detail;
      }
    } catch {
      // fall through to raw message
    }
    return err.message;
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (bootstrappedRef.current || !trimmedText) return;
    bootstrappedRef.current = true;

    const loadingId = `loading-${Date.now()}`;
    setIsLoading(true);
    setMessages([{ id: loadingId, role: 'assistant', content: '', isLoading: true }]);

    generateCounter(trimmedText, [], 'initial')
      .then((response) => {
        setMessages([{ id: `assistant-${Date.now()}`, role: 'assistant', content: response.reply }]);
      })
      .catch((err: unknown) => {
        const message = formatError(err, 'Could not generate counterarguments right now.');
        setError(message);
        setMessages([
          {
            id: `assistant-error-${Date.now()}`,
            role: 'assistant',
            content: 'I could not challenge this text right now. Try again in a moment.',
          },
        ]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [trimmedText]);

  const sendFollowup = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    setError(null);
    setSaveMessage(null);
    setInput('');
    setIsLoading(true);

    const userMessage: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedInput,
    };
    const loadingMessage: ConversationMessage = {
      id: `loading-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      isLoading: true,
    };
    const historyForApi: CounterChatMessage[] = [
      ...messages.filter((message) => !message.isLoading).map(({ role, content }) => ({ role, content })),
      { role: 'user', content: trimmedInput },
    ];

    setMessages((prev) => [...prev, userMessage, loadingMessage]);

    try {
      const response = await generateCounter(trimmedText, historyForApi, 'followup');
      setMessages((prev) => [
        ...prev.filter((message) => !message.isLoading),
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.reply,
        },
      ]);
    } catch (err: unknown) {
      const message = formatError(err, 'Could not continue the challenge chat.');
      setError(message);
      setMessages((prev) => [
        ...prev.filter((message) => !message.isLoading),
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: 'I hit an error while replying. Please try your follow-up again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void sendFollowup();
    }
  };

  const handleSaveToLibrarian = async () => {
    if (!canSaveToLibrarian || isSavingToLibrarian) return;

    setSaveMessage(null);
    setIsSavingToLibrarian(true);
    try {
      const titleSeed = trimmedText.split(/\s+/).slice(0, 6).join(' ');
      const conversation = await importConversation(
        `Challenge: ${titleSeed}${trimmedText.split(/\s+/).length > 6 ? '...' : ''}`,
        [
          {
            role: 'system',
            content: `Saved from Challenge This Text.\n\nSource text:\n${trimmedText}`,
          },
          ...messages
            .filter((message) => !message.isLoading)
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
        ],
      );
      queuePreferredLibrarianConversation(conversation.id);
      setSaveMessage('Saved as a new Virtual Librarian chat.');
    } catch (err) {
      setSaveMessage(err instanceof Error && err.message ? err.message : 'Could not save this chat.');
    } finally {
      setIsSavingToLibrarian(false);
    }
  };

  const MessageBubble: React.FC<{ message: ConversationMessage }> = ({ message }) => {
    const isUser = message.role === 'user';

    if (message.isLoading) {
      return (
        <div className="flex items-start gap-3">
          <div className="rounded-2xl p-2.5 shadow-sm" style={{ background: 'var(--gradient-primary)' }}>
            <SparklesIcon className="w-6 h-6 text-white" />
          </div>
          <div className="max-w-[78%] rounded-[26px] rounded-tl-md border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--primary)] animate-pulse" />
              <span className="h-2 w-2 rounded-full bg-[var(--primary)] animate-pulse" style={{ animationDelay: '0.1s' }} />
              <span className="h-2 w-2 rounded-full bg-[var(--primary)] animate-pulse" style={{ animationDelay: '0.2s' }} />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
        <div
          className="shrink-0 rounded-2xl p-2.5 shadow-sm"
          style={isUser ? { background: 'rgba(148, 163, 184, 0.12)' } : { background: 'var(--gradient-primary)' }}
        >
          {isUser
            ? <UserIcon className="w-5 h-5 text-[var(--text-muted)]" />
            : <SparklesIcon className="w-6 h-6 text-white" />
          }
        </div>
        <div
          className={`px-5 py-4 shadow-sm ${isUser ? 'max-w-[64%] rounded-[26px] rounded-tr-md text-white' : 'max-w-[78%] rounded-[26px] rounded-tl-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'}`}
          style={isUser ? { background: 'var(--gradient-primary)' } : {}}
        >
          {isUser ? (
            <p className="text-base whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <FormattedAiText text={message.content} className="text-base" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="flex h-[min(88vh,820px)] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4" style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(16px)' }}>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl p-2.5" style={{ background: 'var(--gradient-primary)' }}>
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)] font-display">Challenge This Text</h2>
              <p className="text-sm text-[var(--text-muted)]">Pressure-test claims, assumptions, and evidence.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSaveToLibrarian()}
              disabled={!canSaveToLibrarian || isSavingToLibrarian}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'var(--gradient-primary)' }}
            >
              {isSavingToLibrarian ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
              Save to Virtual Librarian
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
              aria-label="Close challenge modal"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] flex-1 min-h-0">
          <aside className="overflow-y-auto border-r border-[var(--border)] bg-[linear-gradient(180deg,rgba(79,70,229,0.08),rgba(15,23,42,0.02))] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-3">Text under review</p>
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
              <p className="text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed">{excerptPreview || 'No text available.'}</p>
            </div>
            <div className="mt-4 rounded-[22px] border border-[var(--border)] bg-[var(--surface)]/70 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">What happens first</div>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                The first reply auto-generates 3 counterarguments and 2 probing questions. Ask follow-ups to dig deeper.
              </p>
            </div>
          </aside>

          <div className="flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto space-y-6 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(15,23,42,0.02))] px-6 py-6">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {error && (
              <div className="px-6 pb-3">
                <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-light)] px-4 py-3 text-sm text-[var(--danger)]">
                  {error}
                </div>
              </div>
            )}

            {saveMessage && (
              <div className="px-6 pb-3">
                <div
                  className="rounded-xl border px-4 py-3 text-sm"
                  style={{
                    borderColor: saveMessage.includes('Saved') ? 'var(--primary)' : 'var(--danger)',
                    background: saveMessage.includes('Saved') ? 'var(--primary-light)' : 'var(--danger-light)',
                    color: saveMessage.includes('Saved') ? 'var(--primary)' : 'var(--danger)',
                  }}
                >
                  {saveMessage}
                </div>
              </div>
            )}

            <div className="border-t border-[var(--border)] px-6 py-4" style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(16px)' }}>
              <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4 shadow-sm">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask a follow-up about weaknesses, evidence, or assumptions..."
                  className="h-12 w-full rounded-full border border-[var(--border)] bg-[var(--bg-secondary)]/60 pl-5 pr-14 text-[var(--text)] placeholder-[var(--text-muted)] transition-shadow focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                  disabled={isLoading || !trimmedText}
                />
                <button
                  type="button"
                  onClick={() => void sendFollowup()}
                  disabled={isLoading || !input.trim() || !trimmedText}
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white transition-all hover:scale-105 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'var(--gradient-primary)' }}
                >
                  {isLoading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-3 text-xs text-[var(--text-muted)]">
                Tip: ask about weak assumptions, missing evidence, hidden tradeoffs, or alternative explanations.
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChallengeModal;
