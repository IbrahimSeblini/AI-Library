import { PlagiarismMatch, PlagiarismReport, Paper } from "../types";
import { fetchJSON } from "./apiService";

interface BackendMatch {
  id: string;
  title: string | null;
  score: number;
}

interface CheckResponse {
  query: string;
  matches: BackendMatch[];
}

export const checkPlagiarism = async (
  essayTitle: string,
  essayText: string,
  options?: { sentenceThreshold?: number }
): Promise<PlagiarismReport> => {
  try {
    const response = await fetchJSON<CheckResponse>('/api/plagiarism/check', {
      method: 'POST',
      body: JSON.stringify({ text: essayText, top_k: 5 })
    });

    const essayWordCount = essayText.split(/\s+/).filter(w => w.length > 0).length;
    
    // Backend returns cosine similarity (0-1).
    // We take the top match score as the overall score, or a weighted average.
    // Let's use the top match score.
    const topScore = response.matches.length > 0 ? response.matches[0].score : 0;
    const overallScore = Math.round(topScore * 100);

    const sources = response.matches.map(m => ({
      paperId: m.id,
      paperTitle: m.title || "Unknown Title",
      maxSimilarity: m.score,
      matchCount: 1 // We don't have sentence count from backend
    }));

    // We don't have sentence-level matches from this backend service yet.
    // We can leave matches empty or try to fake it if needed, but empty is honest.
    const matches: PlagiarismMatch[] = [];

    return {
      wordCount: essayWordCount,
      overallScore: overallScore,
      uniquePercent: Math.max(0, 100 - overallScore),
      matches: matches,
      sources: sources
    };
  } catch (error) {
    console.error("Plagiarism check failed", error);
    throw error;
  }
};

