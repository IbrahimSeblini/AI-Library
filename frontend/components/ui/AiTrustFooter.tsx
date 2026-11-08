import React, { useState } from 'react';
import { submitAiFeedback, type AiFeedbackFeature } from '../../services/apiService';

interface AiTrustFooterProps {
  feature: AiFeedbackFeature | string;
  contextId?: string;
  source: string;
  timestamp?: string | null;
  onRegenerate?: () => void;
  regenerateLabel?: string;
  metadata?: Record<string, unknown>;
  compact?: boolean;
}

function formatTimestamp(value?: string | null) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString();
  } catch {
    return null;
  }
}

const AiTrustFooter: React.FC<AiTrustFooterProps> = ({
  feature,
  contextId,
  source,
  timestamp,
  onRegenerate,
  regenerateLabel = 'Regenerate',
  metadata,
  compact = false,
}) => {
  const [rating, setRating] = useState<'helpful' | 'not_helpful' | null>(null);
  const [saving, setSaving] = useState(false);
  const generatedAt = formatTimestamp(timestamp);

  const handleRate = async (nextRating: 'helpful' | 'not_helpful') => {
    if (saving) return;
    setSaving(true);
    setRating(nextRating);
    try {
      await submitAiFeedback({
        feature,
        context_id: contextId,
        rating: nextRating,
        metadata: {
          source,
          generated_at: timestamp ?? null,
          ...metadata,
        },
      });
    } catch {
      try {
        const key = 'mylibrary_ai_feedback_queue';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.push({
          feature,
          context_id: contextId,
          rating: nextRating,
          metadata: { source, generated_at: timestamp ?? null, ...metadata },
          created_at: new Date().toISOString(),
        });
        localStorage.setItem(key, JSON.stringify(existing.slice(-100)));
      } catch {}
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)] ${compact ? 'leading-snug' : ''}`}>
      <span>{source}{generatedAt ? ` · ${generatedAt}` : ''}</span>
      {onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          className="font-medium text-[var(--primary)] hover:underline"
        >
          {regenerateLabel}
        </button>
      )}
      <button
        type="button"
        onClick={() => handleRate('helpful')}
        className={`font-medium hover:text-[var(--primary)] ${rating === 'helpful' ? 'text-[var(--primary)]' : ''}`}
        disabled={saving}
      >
        {rating === 'helpful' ? 'Helpful ✓' : 'Helpful'}
      </button>
      <button
        type="button"
        onClick={() => handleRate('not_helpful')}
        className={`font-medium hover:text-[var(--danger)] ${rating === 'not_helpful' ? 'text-[var(--danger)]' : ''}`}
        disabled={saving}
      >
        {rating === 'not_helpful' ? 'Not helpful ✓' : 'Not helpful'}
      </button>
    </div>
  );
};

export default AiTrustFooter;
