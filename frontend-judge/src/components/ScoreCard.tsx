import type { FeatureStats } from "../api";

const FEATURE_LABELS: Record<string, string> = {
  summary:          "Summary",
  paraphrase:       "Paraphrase",
  quiz:             "Quiz",
  counterarguments: "Counter",
  librarian:        "Librarian",
  roadmap_graph:    "Roadmap Graph",
  roadmap_explain:  "Roadmap Explain",
};

const FEATURE_SYMS: Record<string, string> = {
  summary:          "Σ",
  paraphrase:       "↻",
  quiz:             "◉",
  counterarguments: "↯",
  librarian:        "⊕",
  roadmap_graph:    "⊞",
  roadmap_explain:  "⊙",
};

function scoreStyle(s: number): { color: string; glow: string; dimBg: string; border: string } {
  if (s >= 8) return {
    color: "var(--color-high)",
    glow: "none",
    dimBg: "var(--color-high-dim)",
    border: "rgba(74,222,128,0.2)",
  };
  if (s >= 6) return {
    color: "var(--color-mid)",
    glow: "none",
    dimBg: "var(--color-mid-dim)",
    border: "rgba(251,191,36,0.2)",
  };
  return {
    color: "var(--color-low)",
    glow: "none",
    dimBg: "var(--color-low-dim)",
    border: "rgba(248,113,113,0.2)",
  };
}

interface Props {
  stats: FeatureStats;
  onClick: () => void;
  delay?: number;
}

export default function ScoreCard({ stats, onClick, delay = 0 }: Props) {
  const score = stats.last_7d_avg ?? stats.avg_overall;
  const { color, glow, dimBg, border } = scoreStyle(score);
  const delta = stats.delta_vs_prev_week;

  return (
    <button
      onClick={onClick}
      className="glass animate-fade-up"
      style={{
        animationDelay: `${delay}s`,
        borderRadius: 8,
        padding: "18px 16px",
        textAlign: "left",
        cursor: "pointer",
        transition: "border-color 0.2s, box-shadow 0.2s, transform 0.2s",
        width: "100%",
        border: "1px solid var(--color-border)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = border;
        (e.currentTarget as HTMLElement).style.boxShadow = `0 16px 34px rgba(17,24,39,0.1)`;
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
        (e.currentTarget as HTMLElement).style.boxShadow = "";
        (e.currentTarget as HTMLElement).style.transform = "";
      }}
    >
      {/* Feature symbol + delta */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="font-mono" style={{
          width: 32, height: 32, borderRadius: 7,
          background: dimBg, border: `1px solid ${border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color, fontWeight: 600,
        }}>
          {FEATURE_SYMS[stats.feature] ?? "?"}
        </div>
        {delta !== null && (
          <span className="font-mono" style={{
            fontSize: 11, fontWeight: 600,
            color: delta > 0 ? "var(--color-high)" : delta < 0 ? "var(--color-low)" : "var(--color-text-dim)",
          }}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}
          </span>
        )}
      </div>

      {/* Score */}
      <div className="font-mono" style={{
        fontSize: 32, fontWeight: 700, lineHeight: 1,
        color, textShadow: glow,
      }}>
        {score > 0 ? score.toFixed(1) : "—"}
      </div>

      {/* Label */}
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text)", marginTop: 8 }}>
        {FEATURE_LABELS[stats.feature] ?? stats.feature}
      </div>
      <div className="font-mono" style={{ fontSize: 10, color: "var(--color-text-dim)", marginTop: 4 }}>
        {stats.total_judgments} eval{stats.total_judgments !== 1 ? "s" : ""}
      </div>
    </button>
  );
}
