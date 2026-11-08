import { SpeechPosition } from '../types';

const STORAGE_PREFIX = 'mylibrary_readaloud';

const memoryStore = new Map<string, string>();

const getStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => memoryStore.set(key, value),
    removeItem: (key: string) => memoryStore.delete(key),
  } as Storage;
};

export const getResumeKey = (bookId: string) => `${STORAGE_PREFIX}:${bookId}`;

export const getResumePosition = (bookId: string): SpeechPosition | null => {
  const storage = getStorage();
  const raw = storage.getItem(getResumeKey(bookId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SpeechPosition;
    if (typeof parsed.paragraphIndex !== 'number' || typeof parsed.sentenceIndex !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
};

export const setResumePosition = (bookId: string, position: SpeechPosition) => {
  const storage = getStorage();
  storage.setItem(getResumeKey(bookId), JSON.stringify(position));
};

export const clearResumePosition = (bookId: string) => {
  const storage = getStorage();
  storage.removeItem(getResumeKey(bookId));
};
