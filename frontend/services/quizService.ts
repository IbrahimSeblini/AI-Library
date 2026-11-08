import { DifficultyMix, QuizQuestion } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const MAX_PER_LEVEL = 10;
export const MAX_TOTAL_QUESTIONS = 10;

export type DifficultyKey = 'easy' | 'normal' | 'hard';

export const DEFAULT_MIX: DifficultyMix = {
  easy: 2,
  normal: 2,
  hard: 1,
};

export async function generateQuizFromText(
  title: string,
  fullText: string,
  mix: DifficultyMix
): Promise<QuizQuestion[]> {
  const res = await fetch(`${API_BASE}/api/quiz/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      title,
      text: fullText,
      difficultyMix: mix,
    }),
  });

  if (!res.ok) {
    // Try to surface backend error detail if present
    let detail = 'Quiz generation failed.';
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(detail);
  }

  const data = await res.json();
  return data.questions;
}
