const PREFERRED_LIBRARIAN_CONVERSATION_KEY = 'mylibrary_preferred_librarian_conversation';
const PREFERRED_LIBRARIAN_PROMPT_KEY = 'mylibrary_preferred_librarian_prompt';

export function queuePreferredLibrarianConversation(conversationId: number): void {
  localStorage.setItem(PREFERRED_LIBRARIAN_CONVERSATION_KEY, String(conversationId));
}

export function consumePreferredLibrarianConversation(): number | null {
  const raw = localStorage.getItem(PREFERRED_LIBRARIAN_CONVERSATION_KEY);
  if (!raw) return null;
  localStorage.removeItem(PREFERRED_LIBRARIAN_CONVERSATION_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function queuePreferredLibrarianPrompt(prompt: string): void {
  localStorage.setItem(PREFERRED_LIBRARIAN_PROMPT_KEY, prompt);
}

export function consumePreferredLibrarianPrompt(): string | null {
  const raw = localStorage.getItem(PREFERRED_LIBRARIAN_PROMPT_KEY);
  if (!raw) return null;
  localStorage.removeItem(PREFERRED_LIBRARIAN_PROMPT_KEY);
  return raw;
}
