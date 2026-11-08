import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Judgment } from "../api";
import Sidebar from "../components/Sidebar";
import ScoreBar from "../components/ScoreBar";

const FEATURE_BADGE: Record<string, string> = {
  summary:          "badge-accent",
  paraphrase:       "badge-cyan",
  quiz:             "badge-purple",
  counterarguments: "badge-mid",
  librarian:        "badge-high",
  roadmap_graph:    "badge-cyan",
  roadmap_explain:  "badge-dim",
};

export default function JudgmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [judgment, setJudgment] = useState<Judgment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.judgment(Number(id))
      .then(setJudgment)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <main className="main-content" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="font-mono" style={{ color: "var(--color-text-dim)", fontSize: 13 }}>Loading...</div>
        </main>
      </div>
    );
  }

  if (!judgment) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <main className="main-content" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "var(--color-low)", fontSize: 14 }}>Judgment not found</div>
        </main>
      </div>
    );
  }

  const score = judgment.overall_score;
  const scoreColor = score >= 8 ? "var(--color-high)" : score >= 6 ? "var(--color-mid)" : "var(--color-low)";
  const scoreGlow = score >= 8 ? "0 0 24px var(--color-high-glow)" : score >= 6 ? "0 0 24px var(--color-mid-glow)" : "0 0 24px var(--color-low-glow)";

  const meta = [
    { label: "Feature",  value: <span className={`badge ${FEATURE_BADGE[judgment.feature] ?? "badge-dim"}`}>{judgment.feature}</span> },
    { label: "Source",   value: <span className={`badge ${judgment.source === "ci" ? "badge-purple" : "badge-dim"}`}>{judgment.source}</span> },
    { label: "User",     value: <span className="font-mono" style={{ fontSize: 12 }}>{judgment.user_id === 0 ? "CI" : `#${judgment.user_id}`}</span> },
    { label: "Latency",  value: <span className="font-mono" style={{ fontSize: 12 }}>{judgment.latency_ms != null ? `${judgment.latency_ms}ms` : "—"}</span> },
    { label: "Model",    value: <span className="font-mono" style={{ fontSize: 12 }}>{judgment.model_used}</span> },
    { label: "Date",     value: <span className="font-mono" style={{ fontSize: 11 }}>{new Date(judgment.created_at).toLocaleString()}</span> },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main className="main-content" style={{ padding: "36px 40px 60px" }}>
        <div className="page-shell">
        {/* Header */}
        <div className="animate-fade-up" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 36 }}>
          <div>
            <button
              onClick={() => navigate(-1)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-dim)", fontSize: 12, marginBottom: 10, padding: 0 }}
            >
              ← Back
            </button>
            <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800, color: "var(--color-text)" }}>
              Judgment <span className="font-mono" style={{ fontSize: 20, color: "var(--color-text-dim)", fontWeight: 400 }}>#{judgment.id}</span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--color-text-dim)", marginTop: 4 }}>
              AI evaluation · {new Date(judgment.created_at).toLocaleDateString()}
            </p>
          </div>

          {/* Score ring */}
          <div className="glass animate-fade-up delay-2" style={{ borderRadius: 8, padding: "18px 30px", textAlign: "center" }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Overall Score</div>
            <div className="font-mono" style={{ fontSize: 48, fontWeight: 700, lineHeight: 1, color: scoreColor, textShadow: scoreGlow }}>
              {score.toFixed(1)}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-dim)", marginTop: 4 }}>out of 10.0</div>
          </div>
        </div>

        {/* Metadata grid */}
        <div className="animate-fade-up delay-1" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {meta.map(({ label, value }) => (
            <div key={label} className="glass" style={{ borderRadius: 8, padding: "14px 18px" }}>
              <div className="section-label" style={{ marginBottom: 8 }}>{label}</div>
              <div style={{ color: "var(--color-text)" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Judge feedback */}
        {judgment.feedback && (
          <div
            className="animate-fade-up delay-2"
            style={{
              borderRadius: 8, padding: "18px 22px", marginBottom: 18,
              background: "rgba(129,140,248,0.06)",
              border: "1px solid rgba(129,140,248,0.2)",
              display: "flex", gap: 14,
            }}
          >
            <div style={{ color: "var(--color-accent)", fontSize: 16, flexShrink: 0, marginTop: 1 }}>◈</div>
            <div>
              <div className="section-label" style={{ color: "var(--color-accent)", marginBottom: 8 }}>Judge Feedback</div>
              <p style={{ fontSize: 14, color: "var(--color-text)", lineHeight: 1.7 }}>{judgment.feedback}</p>
            </div>
          </div>
        )}

        {/* Metric scores */}
        {Object.keys(judgment.scores).length > 0 && (
          <div className="glass animate-fade-up delay-2" style={{ borderRadius: 8, padding: "22px 26px", marginBottom: 18 }}>
            <div className="font-display" style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", marginBottom: 20 }}>
              Metric Scores
            </div>
            <ScoreBar scores={judgment.scores} />
          </div>
        )}

        {/* Input / Output */}
        <div className="animate-fade-up delay-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div className="glass" style={{ borderRadius: 8, padding: "22px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span className="badge badge-dim">INPUT</span>
              <span style={{ fontSize: 11, color: "var(--color-text-dim)" }}>sent to AI service</span>
            </div>
            <pre style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, lineHeight: 1.7,
              color: "var(--color-text-dim)",
              background: "rgba(0,0,0,0.2)",
              borderRadius: 8, padding: "14px 16px",
              overflowX: "auto", whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 400, overflowY: "auto",
              border: "1px solid var(--color-border)",
            }}>
              {JSON.stringify(judgment.input_data, null, 2)}
            </pre>
          </div>
          <div className="glass" style={{ borderRadius: 8, padding: "22px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span className="badge badge-accent">OUTPUT</span>
              <span style={{ fontSize: 11, color: "var(--color-text-dim)" }}>from AI service</span>
            </div>
            <pre style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, lineHeight: 1.7,
              color: "var(--color-accent)",
              background: "rgba(129,140,248,0.04)",
              borderRadius: 8, padding: "14px 16px",
              overflowX: "auto", whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 400, overflowY: "auto",
              border: "1px solid rgba(129,140,248,0.12)",
            }}>
              {JSON.stringify(judgment.output_data, null, 2)}
            </pre>
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}
