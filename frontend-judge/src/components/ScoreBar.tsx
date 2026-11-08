interface Props {
  scores: Record<string, number>;
  animate?: boolean;
}

function barClass(score: number) {
  if (score >= 8) return "glow-bar-high";
  if (score >= 6) return "glow-bar-mid";
  return "glow-bar-low";
}

function scoreColor(score: number) {
  if (score >= 8) return "var(--color-high)";
  if (score >= 6) return "var(--color-mid)";
  return "var(--color-low)";
}

export default function ScoreBar({ scores, animate = true }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Object.entries(scores).map(([metric, score], i) => (
        <div key={metric} className={animate ? `animate-fade-up delay-${Math.min(i + 1, 6)}` : ""}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span className="font-mono" style={{ fontSize: 11, color: "var(--color-text-dim)", textTransform: "capitalize", letterSpacing: "0.06em" }}>
              {metric.replace(/_/g, " ")}
            </span>
            <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: scoreColor(score) }}>
              {score.toFixed(1)}
            </span>
          </div>
          <div className="glow-bar-track">
            <div
              className={`glow-bar-fill ${barClass(score)}`}
              style={{ width: `${(score / 10) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
