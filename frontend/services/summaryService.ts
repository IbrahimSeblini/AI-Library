import { fetchJSON } from './apiService';

export type SummarySize = 'small' | 'medium' | 'large';

export interface SummarizeResponse {
  summary: string;
  size: SummarySize;
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

export const summarizeText = async (
  text: string,
  size: SummarySize
): Promise<SummarizeResponse> => {
  const res = await fetchJSON<SummarizeResponse>('/api/summary/summarize', {
    method: 'POST',
    body: JSON.stringify({ text, size }),
  });
  return res;
};

/** Result of pinging /api/summary/health. Use to show connectivity hints. */
export type SummaryHealth = { ok: true } | { ok: false; networkError: boolean; status?: number };

export const checkSummaryHealth = async (): Promise<SummaryHealth> => {
  const url = `${API_BASE.replace(/\/$/, '')}/api/summary/health`;
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
