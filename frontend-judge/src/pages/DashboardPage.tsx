import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type FeatureStats, type Judgment, type CIRun } from "../api";
import Sidebar from "../components/Sidebar";
import ScoreCard from "../components/ScoreCard";
import TrendChart from "../components/TrendChart";
import JudgmentTable from "../components/JudgmentTable";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<FeatureStats[]>([]);
  const [recentJudgments, setRecentJudgments] = useState<Judgment[]>([]);
  const [totalJudgments, setTotalJudgments] = useState(0);
  const [page, setPage] = useState(1);
  const [lastRun, setLastRun] = useState<CIRun | null>(null);
  const [filterFeature, setFilterFeature] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.stats(),
      api.judgments({ page: 1, page_size: 20, feature: filterFeature || undefined }),
      api.ciRuns(1),
    ]).then(([s, j, runs]) => {
      setStats(s.features);
      setRecentJudgments(j.items);
      setTotalJudgments(j.total);
      setLastRun(runs[0] ?? null);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.judgments({ page, page_size: 20, feature: filterFeature || undefined })
      .then((j) => { setRecentJudgments(j.items); setTotalJudgments(j.total); })
      .catch(console.error);
  }, [page, filterFeature]);

  const overallAvg = stats.length
    ? stats.filter(s => s.avg_overall > 0).reduce((a, s) => a + s.avg_overall, 0) /
      Math.max(stats.filter(s => s.avg_overall > 0).length, 1)
    : 0;

  const overallColor = overallAvg >= 8 ? "var(--color-high)" : overallAvg >= 6 ? "var(--color-mid)" : "var(--color-low)";
  const overallGlow = overallAvg >= 8 ? "0 0 20px var(--color-high-glow)" : overallAvg >= 6 ? "0 0 20px var(--color-mid-glow)" : "0 0 20px var(--color-low-glow)";

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main className="main-content" style={{ padding: "36px 40px 60px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
            <div className="font-mono" style={{ color: "var(--color-text-dim)", fontSize: 13 }}>
              Loading data<span style={{ animation: "pulse-dot 1s infinite" }}>...</span>
            </div>
          </div>
        ) : (
          <div className="page-shell">
            {/* Page header */}
            <div className="animate-fade-up" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 36 }}>
              <div>
                <h1 className="font-display" style={{ fontSize: 28, fontWeight: 800, color: "var(--color-text)" }}>
                  Overview
                </h1>
                <p style={{ fontSize: 13, color: "var(--color-text-dim)", marginTop: 6 }}>
                  AI feature quality · real-time evaluation results
                </p>
              </div>
              {overallAvg > 0 && (
                <div className="glass animate-fade-up delay-2" style={{ borderRadius: 8, padding: "14px 22px", textAlign: "center" }}>
                  <div className="section-label" style={{ marginBottom: 6 }}>Overall avg</div>
                  <div className="font-mono" style={{ fontSize: 36, fontWeight: 700, color: overallColor, textShadow: overallGlow }}>
                    {overallAvg.toFixed(1)}
                  </div>
                </div>
              )}
            </div>

            {/* Score cards */}
            <div className="animate-fade-up delay-1" style={{ marginBottom: 32 }}>
              <div className="section-label" style={{ marginBottom: 14 }}>Feature Scores · last 7 days</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                {stats.map((s, i) => (
                  <ScoreCard key={s.feature} stats={s} delay={i * 0.05} onClick={() => navigate(`/feature/${s.feature}`)} />
                ))}
              </div>
            </div>

            {/* Trend chart */}
            <div className="glass animate-fade-up delay-2" style={{ borderRadius: 8, padding: "22px 26px", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <div className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text)" }}>
                    Score Trend
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-dim)", marginTop: 2 }}>
                    Daily avg across all features
                  </div>
                </div>
              </div>
              <TrendChart judgments={recentJudgments} height={180} />
            </div>

            {/* CI Run banner */}
            {lastRun && (
              <div
                className={`glass animate-fade-up delay-3`}
                onClick={() => navigate(`/ci/runs/${lastRun.id}`)}
                style={{
                  borderRadius: 8,
                  padding: "16px 24px",
                  marginBottom: 18,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderColor: lastRun.failed === 0 ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px rgba(129,140,248,0.1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: lastRun.failed === 0 ? "var(--color-high)" : "var(--color-low)",
                    boxShadow: lastRun.failed === 0 ? "0 0 10px var(--color-high-glow)" : "0 0 10px var(--color-low-glow)",
                    flexShrink: 0,
                  }} />
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>
                      Last CI Run #{lastRun.id}
                    </span>
                    <span className="font-mono" style={{ fontSize: 11, color: "var(--color-text-dim)", marginLeft: 10 }}>
                      {new Date(lastRun.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <span className="badge badge-high">{lastRun.passed} passed</span>
                  {lastRun.failed > 0 && <span className="badge badge-low">{lastRun.failed} failed</span>}
                  <span style={{ fontSize: 12, color: "var(--color-accent)" }}>Inspect →</span>
                </div>
              </div>
            )}

            {/* Judgments table */}
            <div className="glass animate-fade-up delay-4" style={{ borderRadius: 8, padding: "22px 26px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <div className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text)" }}>
                    Recent Judgments
                  </div>
                  <div className="font-mono" style={{ fontSize: 11, color: "var(--color-text-dim)", marginTop: 2 }}>
                    {totalJudgments} total
                  </div>
                </div>
                <select
                  value={filterFeature}
                  onChange={(e) => { setFilterFeature(e.target.value); setPage(1); }}
                  className="field"
                  style={{ borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer" }}
                >
                  <option value="">All features</option>
                  {["summary", "paraphrase", "quiz", "counterarguments", "librarian", "roadmap_graph", "roadmap_explain"].map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <JudgmentTable
                items={recentJudgments}
                total={totalJudgments}
                page={page}
                pageSize={20}
                onPage={setPage}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
