import { queuePreferredLibrarianConversation } from './librarianConversation';

const READER_JUMP_TARGET_KEY = 'mylibrary_reader_jump_target';

export interface ReaderJumpTarget {
  paperId: string;
  paragraphIndex: number;
  excerpt?: string;
  conversationId?: number;
}

export const queueReaderJumpTarget = (target: ReaderJumpTarget) => {
  localStorage.setItem(READER_JUMP_TARGET_KEY, JSON.stringify(target));
};

export const consumeReaderJumpTarget = (): ReaderJumpTarget | null => {
  const raw = localStorage.getItem(READER_JUMP_TARGET_KEY);
  if (!raw) return null;
  localStorage.removeItem(READER_JUMP_TARGET_KEY);
  try {
    return JSON.parse(raw) as ReaderJumpTarget;
  } catch {
    return null;
  }
};

export const openCitationInReader = (
  paperId: number,
  paragraphIndex: number,
  conversationId?: number,
  excerpt?: string
) => {
  if (conversationId) {
    queuePreferredLibrarianConversation(conversationId);
  }
  queueReaderJumpTarget({
    paperId: String(paperId),
    paragraphIndex,
    conversationId,
    excerpt,
  });
};
