import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { sendMessage, getConversations, getConversation, deleteConversation, createConversation, renameConversation } from '../services/apiService';
import type { Conversation } from '../services/apiService';
import { SendIcon } from './icons/SendIcon';
import { UserIcon } from './icons/UserIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { LoaderIcon } from './icons/LoaderIcon';
import { XIcon } from './icons/XIcon';
import { PencilIcon } from './icons/PencilIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { PlusIcon } from './icons/PlusIcon';
import FormattedAiText from './ui/FormattedAiText';
import AiTrustFooter from './ui/AiTrustFooter';
import { consumePreferredLibrarianConversation, consumePreferredLibrarianPrompt } from '../lib/librarianConversation';
import { openCitationInReader } from '../lib/readerNavigation';

const SUGGESTED_PROMPTS = [
  { label: 'Summarize my last paper' },
  { label: 'Find papers on machine learning' },
  { label: 'What are the main themes in my library?' },
  { label: 'Suggest a reading order for my saved papers' },
];

function formatConversationDate(createdAt: string) {
  try {
    const d = new Date(createdAt);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

interface ChatbotProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onOpenCitation: (paperId: number) => void;
}

const Chatbot: React.FC<ChatbotProps> = ({ messages, setMessages, onOpenCitation }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const mapConversationMessages = (conv: Conversation): ChatMessage[] => {
    const mapped = conv.messages.map((m) => ({
      id: m.id.toString(),
      text: m.content,
      sender: m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'ai',
      citations: m.metadata?.citations,
    })) as ChatMessage[];

    return mapped.length > 0
      ? mapped
      : [{
          id: 'init',
          text: "Hello! I'm your virtual librarian. How can I help you find information today?",
          sender: 'ai',
        }];
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    const loadConversation = async () => {
      setIsLoadingHistory(true);
      try {
        const convList = await getConversations();
        setConversations(convList);
        const preferredConversationId = consumePreferredLibrarianConversation();
        const initialConversationId = preferredConversationId ?? convList[0]?.id ?? null;

        if (initialConversationId) {
          setConversationId(initialConversationId);
          const conv = await getConversation(initialConversationId);
          setMessages(mapConversationMessages(conv));
        } else {
          setMessages([{
            id: 'init',
            text: "Hello! I'm your virtual librarian. How can I help you find information today?",
            sender: 'ai',
          }]);
        }
        const queuedPrompt = consumePreferredLibrarianPrompt();
        if (queuedPrompt) {
          setInput(queuedPrompt);
          setTimeout(() => inputRef.current?.focus(), 50);
        }
      } catch (error) {
        console.error('Failed to load conversation:', error);
        setMessages([{
          id: 'init',
          text: "Hello! I'm your virtual librarian. How can I help you find information today?",
          sender: 'ai',
        }]);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadConversation();
  }, []);

  const loadConversationById = async (id: number) => {
    try {
      const conv = await getConversation(id);
      setConversationId(id);
      setMessages(mapConversationMessages(conv));
      setIsHistoryOpen(false);
    } catch (e) {
      console.error('Failed to load conversation', e);
    }
  };

  const welcomeMessage: ChatMessage = {
    id: 'init',
    text: "Hello! I'm your virtual librarian. How can I help you find information today?",
    sender: 'ai',
  };

  const handleNewConversation = async () => {
    try {
      const newConv = await createConversation();
      setConversationId(newConv.id);
      setMessages([welcomeMessage]);
      const convList = await getConversations();
      setConversations(convList);
      setIsHistoryOpen(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (error: any) {
      console.error('Failed to create conversation:', error);
      alert('Failed to start a new conversation. Please try again.');
    }
  };

  const handleSend = async (text?: string) => {
    const toSend = (text ?? input).trim();
    if (!toSend || isLoading) return;

    setInput('');
    setIsLoading(true);

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: toSend,
      sender: 'user',
    };
    const loadingMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      text: '',
      sender: 'ai',
      isLoading: true,
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);

    try {
      const response = await sendMessage(toSend, conversationId || undefined);

      if (!conversationId) {
        setConversationId(response.conversation_id);
        const convList = await getConversations();
        setConversations(convList);
      }

      const aiMessage: ChatMessage = {
        id: response.assistant_message.id.toString(),
        text: response.assistant_message.content,
        sender: 'ai',
        citations: response.assistant_message.metadata?.citations,
      };

      setMessages(prev => {
        const withoutLoading = prev.filter(m => !m.isLoading);
        return [...withoutLoading, aiMessage];
      });
    } catch (error: any) {
      console.error('Chatbot error:', error);

      let errorText = 'Sorry, something went wrong. Please try again.';
      if (error.message) {
        if (
          error.message.includes('virtual librarian') ||
          error.message.includes('temporarily unavailable') ||
          error.message.includes('taking longer')
        ) {
          errorText = error.message;
        } else if (error.message.includes('timeout') || error.message.includes('Network error')) {
          errorText = 'The virtual librarian is temporarily unavailable. Please try again in a moment.';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorText = 'Unable to connect to the virtual librarian. Please check your connection and try again.';
        } else {
          errorText = 'The virtual librarian encountered an issue. Please try again.';
        }
      }

      const errorMessage: ChatMessage = {
        id: (Date.now() + 2).toString(),
        text: errorText,
        sender: 'ai',
      };

      setMessages(prev => {
        const withoutLoading = prev.filter(m => !m.isLoading);
        return [...withoutLoading, errorMessage];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const handleDeleteHistory = async () => {
    if (!conversationId) return;
    if (!window.confirm('Are you sure you want to delete this conversation? This cannot be undone.')) return;
    try {
      await deleteConversation(conversationId);
      const convList = await getConversations();
      setConversations(convList);
      setConversationId(null);
      setMessages([welcomeMessage]);
    } catch (error: any) {
      console.error('Failed to delete conversation:', error);
      alert('Failed to delete conversation history. Please try again.');
    }
  };

  const handleDeleteConversation = async (e: React.MouseEvent, cId: number) => {
    e.stopPropagation();
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await deleteConversation(cId);
      const convList = await getConversations();
      setConversations(convList);
      if (conversationId === cId) {
        if (convList.length > 0) {
          loadConversationById(convList[0].id);
        } else {
          setConversationId(null);
          setMessages([welcomeMessage]);
        }
      }
    } catch (err: any) {
      console.error('Failed to delete conversation:', err);
      alert('Failed to delete conversation. Please try again.');
    }
  };

  const handleRenameConversation = async (e: React.MouseEvent, c: Conversation) => {
    e.stopPropagation();
    const newTitle = window.prompt('Rename conversation', c.title || '');
    if (newTitle === null) return;
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    try {
      await renameConversation(c.id, trimmed);
      const convList = await getConversations();
      setConversations(convList);
    } catch (err: any) {
      console.error('Failed to rename conversation:', err);
      alert('Failed to rename conversation. Please try again.');
    }
  };

  // True when no user messages have been sent yet (new/empty chat)
  const isNewChat = !messages.some(m => m.sender === 'user');

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 flex-shrink-0">
        <button
          type="button"
          onClick={handleNewConversation}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary)]/5"
        >
          <PlusIcon className="w-4 h-4" />
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {conversations.length > 0 && (
          <p className="px-2 mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Recent
          </p>
        )}
        <ul className="space-y-0.5">
          {conversations.slice(0, 20).map((c) => (
            <li key={c.id} className="group flex items-center rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => loadConversationById(c.id)}
                className={`min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  conversationId === c.id
                    ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]'
                }`}
              >
                <span className="block truncate text-sm">
                  {c.title && c.title.trim() ? c.title.trim() : 'New conversation'}
                </span>
                <span className="text-[11px] opacity-60">{formatConversationDate(c.created_at)}</span>
              </button>
              <div className="flex flex-shrink-0 items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => handleRenameConversation(e, c)}
                  className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--bg-secondary)]"
                  title="Rename"
                >
                  <PencilIcon className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDeleteConversation(e, c.id)}
                  className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--bg-secondary)]"
                  title="Delete"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            </li>
          ))}
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-xs text-center text-[var(--text-muted)]">No conversations yet</p>
          )}
        </ul>
      </div>
    </div>
  );

  const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const isUser = message.sender === 'user';
    const isSystem = message.sender === 'system';

    // Group citations by paper_title (not paper_id — backend can return same paper with different IDs).
    // Each unique paper title appears once. Only show sources when they add value:
    // suppress if only 1 unique paper is cited but the answer is long (likely a thematic overview
    // where the cited passage is just RAG context, not the source of most claims).
    const citationsByPaper = (() => {
      if (!message.citations?.length) return [];
      const map = new Map<string, { paper_id: number; paper_title: string; paragraphs: { index: number; number: number; excerpt: string }[] }>();
      for (const c of message.citations) {
        const key = c.paper_title.trim().toLowerCase();
        const existing = map.get(key);
        if (existing) {
          if (!existing.paragraphs.some(p => p.number === c.paragraph_number)) {
            existing.paragraphs.push({ index: c.paragraph_index, number: c.paragraph_number, excerpt: c.excerpt });
          }
        } else {
          map.set(key, {
            paper_id: c.paper_id,
            paper_title: c.paper_title,
            paragraphs: [{ index: c.paragraph_index, number: c.paragraph_number, excerpt: c.excerpt }],
          });
        }
      }
      const papers = Array.from(map.values());
      // Suppress sources when only 1 paper is cited but the answer is substantial (>300 chars) —
      // that means the AI answered from general knowledge and the citation is just RAG context noise.
      if (papers.length === 1 && message.text.length > 300) return [];
      return papers;
    })();

    if (message.isLoading) {
      return (
        <div className="flex items-start gap-3">
          <div className="rounded-2xl p-2.5 shadow-sm flex-shrink-0" style={{ background: 'var(--gradient-primary)' }}>
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div className="max-w-[78%] rounded-[26px] rounded-tl-md border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--primary)] animate-pulse" />
              <span className="h-2 w-2 rounded-full bg-[var(--primary)] animate-pulse" style={{ animationDelay: '0.15s' }} />
              <span className="h-2 w-2 rounded-full bg-[var(--primary)] animate-pulse" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        </div>
      );
    }

    if (isSystem) {
      return (
        <div className="mx-auto max-w-3xl rounded-[24px] border border-[var(--border)] bg-[var(--bg-secondary)]/50 px-5 py-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Saved Context</div>
          <FormattedAiText text={message.text} className="mt-3 text-sm text-[var(--text-muted)]" />
        </div>
      );
    }

    return (
      <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse -mr-[30px]' : '-ml-[30px]'}`}>
        <div
          className="shrink-0 rounded-2xl p-2.5 shadow-sm"
          style={isUser ? { background: 'rgba(148, 163, 184, 0.12)' } : { background: 'var(--gradient-primary)' }}
        >
          {isUser
            ? <UserIcon className="w-5 h-5 text-[var(--text-muted)]" />
            : <SparklesIcon className="w-5 h-5 text-white" />
          }
        </div>
        <div
          className={`px-5 py-4 shadow-sm ${
            isUser
              ? 'max-w-[72%] rounded-[26px] rounded-tr-md text-white'
              : 'max-w-[85%] rounded-[26px] rounded-tl-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'
          }`}
          style={isUser ? { background: 'var(--gradient-primary)' } : {}}
        >
          {isUser ? (
            <p className="text-base whitespace-pre-wrap leading-relaxed">{message.text}</p>
          ) : (
            <>
              <FormattedAiText text={message.text} className="text-base" />
              {citationsByPaper.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]/60">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Sources</span>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {citationsByPaper.map((entry) => {
                      // If exactly one paragraph was cited, link to that paragraph specifically
                      const singlePara = entry.paragraphs.length === 1 ? entry.paragraphs[0] : null;
                      return (
                        <button
                          key={`${message.id}-${entry.paper_id}`}
                          type="button"
                          onClick={() => {
                            if (singlePara) {
                              openCitationInReader(entry.paper_id, singlePara.index, conversationId ?? undefined, singlePara.excerpt);
                            }
                            onOpenCitation(entry.paper_id);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs text-[var(--primary)] hover:underline transition-colors self-start"
                          title={singlePara?.excerpt ?? entry.paper_title}
                        >
                          <svg className="w-3 h-3 flex-shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          {entry.paper_title}
                          {singlePara && (
                            <span className="text-[var(--text-muted)] font-normal">¶{singlePara.number}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <AiTrustFooter
                feature="librarian"
                contextId={String(message.id)}
                source={`Answered from your library${message.citations?.length ? ` · ${citationsByPaper.length || message.citations.length} source${(citationsByPaper.length || message.citations.length) !== 1 ? 's' : ''}` : ''}`}
                metadata={{ citation_count: message.citations?.length ?? 0 }}
                compact
              />
            </>
          )}
        </div>
      </div>
    );
  };

  if (isLoadingHistory) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <LoaderIcon className="w-12 h-12 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full bg-[var(--bg)]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex h-full w-[260px] flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {isHistoryOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setIsHistoryOpen(false)}
          />
          <aside className="fixed inset-y-16 left-0 z-50 flex w-[80vw] max-w-[300px] flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl lg:hidden">
            <SidebarContent />
          </aside>
        </>
      )}

      {/* Main chat panel */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:text-[var(--text)] hover:bg-[var(--bg-secondary)] lg:hidden"
              title="Open chats"
            >
              <HistoryIcon className="h-4 w-4" />
            </button>
            <div className="rounded-xl p-2" style={{ background: 'var(--gradient-primary)' }}>
              <SparklesIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text)] font-display leading-tight">Virtual Librarian</h2>
              <p className="text-xs text-[var(--text-muted)]">Search, synthesize, and explore your library.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNewConversation}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--primary)] hover:bg-[var(--bg-secondary)]"
            >
              <PlusIcon className="w-4 h-4" />
              <span className="hidden sm:inline">New chat</span>
            </button>
            {conversationId && (
              <button
                onClick={handleDeleteHistory}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--danger)] hover:bg-[var(--bg-secondary)]"
              >
                <XIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Messages / Empty state */}
        <div className="flex-1 overflow-y-auto bg-[var(--bg)]">
          {isNewChat ? (
            /* Empty state — centered welcome with suggested prompts */
            <div className="flex flex-col items-center justify-center h-full px-6 py-12 gap-10">
              <div className="text-center">
                <div
                  className="mx-auto mb-5 w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
                  style={{ background: 'var(--gradient-primary)' }}
                >
                  <SparklesIcon className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-[var(--text)] font-display">How can I help you today?</h2>
                <p className="mt-2 text-sm text-[var(--text-muted)] max-w-md mx-auto">
                  Ask me anything about your saved papers — themes, summaries, reading order, or a specific topic.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-[1000px]">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setInput(p.label);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-left transition-all hover:border-[var(--primary)] hover:shadow-sm text-[var(--text)] hover:bg-[var(--primary)]/5"
                  >
                    <span className="text-sm font-medium leading-snug">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Conversation messages */
            <div className="mx-auto w-full max-w-[1000px] space-y-6 px-10 py-7">
              {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-[var(--border)] bg-[var(--surface)] px-5 py-4 flex-shrink-0">
          <div className="mx-auto max-w-[1000px]">
            <div className="relative flex items-center rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] pl-5 pr-2 py-2 shadow-sm focus-within:ring-2 focus-within:ring-[var(--primary)] focus-within:border-transparent transition-all">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Message Virtual Librarian…"
                className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none py-2 min-w-0"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim()}
                className="ml-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                style={{ background: 'var(--gradient-primary)' }}
              >
                {isLoading
                  ? <LoaderIcon className="w-4 h-4 animate-spin" />
                  : <SendIcon className="w-4 h-4" />
                }
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">
              Responses are based on your saved library. Always verify important information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;
