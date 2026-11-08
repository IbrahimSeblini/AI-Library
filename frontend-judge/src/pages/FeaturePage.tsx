import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Judgment, type FeatureStats } from "../api";
import Sidebar from "../components/Sidebar";
import TrendChart from "../components/TrendChart";
import ScoreBar from "../components/ScoreBar";
import JudgmentTable from "../components/JudgmentTable";

const FEATURE_SYMS: Record<string, string> = {
  summary:          "Σ",
  paraphrase:       "↻",
  quiz:             "◉",
  counterarguments: "↯",
  librarian:        "⊕",
  roadmap_graph:    "⊞",
  roadmap_explain:  "⊙",
};

const FEATURE_LABELS: Record<string, string> = {
  summary:          "Summary",
  paraphrase:       "Paraphrase",
  quiz:             "Quiz",
  counterarguments: "Counterarguments",
  librarian:        "Librarian",
  roadmap_graph:    "Roadmap Graph",
  roadmap_explain:  "Roadmap Explain",
};

export default function FeaturePage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [judgments, setJudgments] = useState<Judgment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<FeatureStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!name) return;
    Promise.all([
      api.stats(),
      api.judgments({ feature: name, page: 1, page_size: 20 }),
    ]).then(([s, j]) => {
      setStats(s.features.find((f) => f.feature === name) ?? null);
      setJudgments(j.items);
      setTotal(j.total);
    }).catch(console.error).finally(() => setLoading(false));
  }, [name]);

  useEffect(() => {
    if (!name) return;
    api.judgments({ feature: name, page, page_size: 20 })
      .then((j) => { setJudgments(j.items); setTotal(j.total); })
      .catch(console.error);
  }, [page, name]);

  const score = stats?.last_7d_avg ?? stats?.avg_overall ?? 0;
  const scoreColor = score >= 8 ? "var(--color-high)" : score >= 6 ? "var(--color-mid)" : "var(--color-low)";
  const scoreGlow = score >= 8 ? "0 0 24px var(--color-high-glow)" : score >= 6 ? "0 0 24px var(--color-mid-glow)" : "0 0 24px var(--color-low-glow)";

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main className="main-content" style={{ padding: "36px 40px 60px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
            <div className="font-mono" style={{ color: "var(--color-text-dim)", fontSize: 13 }}>Loading...</div>
          </div>
        ) : (
          <div className="page-shell">
            {/* Header */}
            <div className="animate-fade-up" style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: 36 }}>
              <div
                className="font-mono"
                style={{
                  width: 52, height: 52, borderRadius: 8, flexShrink: 0,
                  background: score >= 8 ? "var(--color-high-dim)" : score >= 6 ? "var(--color-mid-dim)" : "var(--color-low-dim)",
                  border: `1px solid ${score >= 8 ? "rgba(74,222,128,0.25)" : score >= 6 ? "rgba(251,191,36,0.25)" : "rgba(248,113,113,0.25)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, color: scoreColor, fontWeight: 700,
                }}
              >
                {FEATURE_SYMS[name ?? ""] ?? "?"}
              </div>
              <div style={{ flex: 1 }}>
                <button
                  onClick={() => navigate("/")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-dim)", fontSize: 12, marginBottom: 6, padding: 0, display: "flex", alignItems: "center", gap: 6 }}
                >
                  ← Overview
                </button>
                <h1 className="font-display" style={{ fontSize: 28, fontWeight: 800, color: "var(--color-text)" }}>
                  {FEATURE_LABELS[name ?? ""] ?? name}
                </h1>
                <p style={{ fontSize: 13, color: "var(--color-text-dim)", marginTop: 4 }}>
                  {total} evaluations · all-time quality metrics
                </p>
              </div>
              {score > 0 && (
                <div className="glass animate-fade-up delay-2" style={{ borderRadius: 8, padding: "14px 22px", textAlign: "center", flexShrink: 0 }}>
                  <div className="section-label" style={{ marginBottom: 6 }}>Avg Score</div>
                  <div className="font-mono" style={{ fontSize: 36, fontWeight: 700, color: scoreColor, textShadow: scoreGlow }}>
                    {score.toFixed(1)}
                  </div>
                </div>
              )}
            </div>

            {/* Metrics + Trend grid */}
            <div className="animate-fade-up delay-1" style={{ display: "grid", gridTemplateColumns: "minmax(260px, 320px) 1fr", gap: 18, marginBottom: 18 }}>
              {stats?.avg_scores && Object.keys(stats.avg_scores).length > 0 && (
                <div className="glass" style={{ borderRadius: 8, padding: "22px 24px" }}>
                  <div className="font-display" style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", marginBottom: 18 }}>
                    Avg Metrics
                  </div>
                  <ScoreBar scores={stats.avg_scores} />
                </div>
              )}
              <div className="glass" style={{ borderRadius: 8, padding: "22px 24px" }}>
                <div className="font-display" style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", marginBottom: 18 }}>
                  Score Trend
                </div>
                <TrendChart judgments={judgments} feature={name} height={160} />
              </div>
            </div>

            {/* Judgments table */}
            <div className="glass animate-fade-up delay-2" style={{ borderRadius: 8, padding: "22px 26px" }}>
              <div className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text)", marginBottom: 20 }}>
                Evaluations
              </div>
              <JudgmentTable items={judgments} total={total} page={page} pageSize={20} onPage={setPage} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
