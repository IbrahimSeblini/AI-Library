import { fetchJSON } from './apiService';

export interface ParaphraseResponse {
  paraphrased: string;
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

export const paraphraseText = async (text: string): Promise<ParaphraseResponse> => {
  const res = await fetchJSON<ParaphraseResponse>('/api/paraphrase/paraphrase', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  return res;
};

export type ParaphraseHealth = { ok: true } | { ok: false; networkError: boolean; status?: number };

export const checkParaphraseHealth = async (): Promise<ParaphraseHealth> => {
  const url = `${API_BASE.replace(/\/$/, '')}/api/paraphrase/health`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (res.ok) return { ok: true };
    return { ok: false, networkError: false, status: res.status };
  } catch (e: any) {
    clearTimeout(t);
    const isNetwork = !!(
      e?.name === 'AbortError' ||
      (e?.message && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')))
    );
    return { ok: false, networkError: isNetwork };
  }
};
