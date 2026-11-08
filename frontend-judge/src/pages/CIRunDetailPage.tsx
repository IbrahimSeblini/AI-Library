import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Judgment, type CIRun } from "../api";
import ScoreBar from "../components/ScoreBar";
import Sidebar from "../components/Sidebar";

const FEATURE_ICONS: Record<string, string> = {
  summary:          "Σ",
  paraphrase:       "↻",
  quiz:             "◉",
  counterarguments: "↯",
  librarian:        "⊕",
  roadmap_graph:    "⊞",
  roadmap_explain:  "⊙",
};

function scoreChip(score: number, large = false) {
  const badge = score >= 8 ? "badge-high" : score >= 6 ? "badge-mid" : "badge-low";
  return (
    <span className={`badge ${badge}`} style={{ fontSize: large ? 18 : 12, padding: large ? "5px 12px" : "2px 8px" }}>
      {score.toFixed(1)}
    </span>
  );
}

function renderValue(val: unknown): string {
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return JSON.stringify(val, null, 2);
  if (typeof val === "object" && val !== null) return JSON.stringify(val, null, 2);
  return String(val);
}

function InputSection({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      {Object.entries(data).map(([key, val]) => {
        const str = renderValue(val);
        const isLong = str.length > 120;
        return (
          <div key={key}>
            <div className="section-label" style={{ marginBottom: 6 }}>
              {key.replace(/_/g, " ")}
            </div>
            <div className={`glass-light ${isLong ? "font-mono" : ""}`} style={{ borderRadius: 8, padding: "10px 12px", color: "var(--color-text)", fontSize: isLong ? 11 : 13, lineHeight: 1.65 }}>
              {isLong ? (
                <pre className="whitespace-pre-wrap break-words">{str}</pre>
              ) : (
                <span>{str}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OutputSection({ feature, data }: { feature: string; data: Record<string, unknown> }) {
  // Render the most relevant output field prominently, rest as details
  const primaryKeys: Record<string, string[]> = {
    summary: ["summary"],
    paraphrase: ["paraphrased"],
    quiz: ["questions"],
    counterarguments: ["reply"],
    librarian: ["assistant_message"],
    roadmap_explain: ["explanation"],
    roadmap_graph:   ["concepts", "relationships"],
  };

  const primary = primaryKeys[feature] ?? [];

  return (
    <div className="space-y-3">
      {Object.entries(data).map(([key, val]) => {
        const isPrimary = primary.includes(key);
        const str = renderValue(val);
        if (!isPrimary && str.length > 400) return null; // skip giant non-primary blobs
        return (
          <div key={key}>
            <div className="section-label" style={{ marginBottom: 6 }}>
              {key.replace(/_/g, " ")}
              {isPrimary && <span style={{ marginLeft: 6, color: "var(--color-accent)" }}>primary</span>}
            </div>
            <div
              className="glass-light"
              style={{
                borderRadius: 8,
                padding: "10px 12px",
                color: "var(--color-text)",
                fontSize: 13,
                lineHeight: 1.65,
                borderColor: isPrimary ? "rgba(79,99,215,0.18)" : "var(--color-border)",
                background: isPrimary ? "var(--color-accent-dim)" : "rgba(255,255,255,0.7)",
              }}
            >
              {typeof val === "object" ? (
                <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed">{str}</pre>
              ) : (
                <span className="leading-relaxed">{str}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JudgmentCard({ judgment, index }: { judgment: Judgment; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const pass = judgment.overall_score >= 7.0;

  return (
    <div className="glass" style={{ borderRadius: 8, overflow: "hidden", borderColor: pass ? "var(--color-border)" : "rgba(201,42,42,0.22)" }}>
      {/* Card header — always visible */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
        onClick={() => setExpanded((v) => !v)}
        style={{ background: pass ? "rgba(255,255,255,0.74)" : "var(--color-low-dim)", border: "none", cursor: "pointer" }}
      >
        <span className="font-mono" style={{ color: "var(--color-text-dim)", fontSize: 12, width: 24, flexShrink: 0 }}>#{index + 1}</span>
        <span className="font-mono" style={{ color: "var(--color-accent)", fontSize: 14, width: 20, textAlign: "center" }}>{FEATURE_ICONS[judgment.feature] ?? "?"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge badge-accent">
              {judgment.feature}
            </span>
            {judgment.test_case_description && (
              <span style={{ fontSize: 13, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{judgment.test_case_description}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1" style={{ flexWrap: "wrap" }}>
            <span className="font-mono" style={{ fontSize: 11, color: "var(--color-text-dim)" }}>
              {Object.entries(judgment.scores)
                .filter(([m]) => m !== "latency")
                .map(([m, v]) => `${m.replace(/_/g, " ")}: ${v}`)
                .join(" · ")}
            </span>
            {judgment.latency_ms != null && (
              <span className="font-mono" style={{ fontSize: 11, color: "var(--color-text-dim)", opacity: 0.7 }}>
                ⏱ {judgment.latency_ms >= 1000
                  ? `${(judgment.latency_ms / 1000).toFixed(1)}s`
                  : `${judgment.latency_ms}ms`}
                {judgment.scores["latency"] != null && ` (${judgment.scores["latency"].toFixed(1)}/10)`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {scoreChip(judgment.overall_score, true)}
          <span className={`badge ${pass ? "badge-high" : "badge-low"}`}>
            {pass ? "pass" : "fail"}
          </span>
          <span style={{ color: "var(--color-text-dim)", fontSize: 12 }}>{expanded ? "Collapse" : "Expand"}</span>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--color-border)" }}>
          {/* Feedback banner */}
          {judgment.feedback && (
            <div className="px-5 py-3 flex gap-2" style={{ background: "rgba(161,98,7,0.08)", borderBottom: "1px solid rgba(161,98,7,0.14)" }}>
              <span style={{ color: "var(--color-mid)", flexShrink: 0 }}>Note</span>
              <p style={{ fontSize: 13, color: "var(--color-text)", lineHeight: 1.65 }}>{judgment.feedback}</p>
            </div>
          )}

          {/* Metric scores */}
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)", background: "rgba(17,24,39,0.025)" }}>
            <h3 className="section-label" style={{ marginBottom: 12 }}>Judge Scores</h3>
            <ScoreBar scores={judgment.scores} />
          </div>

          {/* Input / Output side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2" style={{ borderTop: "0 solid transparent" }}>
            <div className="px-5 py-4">
              <h3 className="section-label" style={{ marginBottom: 12 }}>
                Input to AI service
              </h3>
              <InputSection data={judgment.input_data} />
            </div>
            <div className="px-5 py-4" style={{ borderLeft: "1px solid var(--color-border)" }}>
              <h3 className="section-label" style={{ marginBottom: 12 }}>
                Output from AI service
              </h3>
              <OutputSection feature={judgment.feature} data={judgment.output_data} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CIRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<(CIRun & { judgments: Judgment[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterFeature, setFilterFeature] = useState("");
  const [filterResult, setFilterResult] = useState<"all" | "pass" | "fail">("all");

  async function refreshRun() {
    if (!id) return;
    const next = await api.ciRun(Number(id));
    setRun(next);
  }

  useEffect(() => {
    if (!id) return;
    api.ciRun(Number(id))
      .then(setRun)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!run || run.finished_at) return;
    const timer = window.setInterval(() => {
      refreshRun().catch(console.error);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [run?.id, run?.finished_at]);

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
  if (!run) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <main className="main-content" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "var(--color-low)", fontSize: 14 }}>Run not found</div>
        </main>
      </div>
    );
  }

  const judgments = run.judgments ?? [];
  const filtered = judgments.filter((j) => {
    if (filterFeature && j.feature !== filterFeature) return false;
    if (filterResult === "pass" && j.overall_score < 7.0) return false;
    if (filterResult === "fail" && j.overall_score >= 7.0) return false;
    return true;
  });

  const duration = run.finished_at
    ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : null;

  const avgScore = judgments.length
    ? judgments.reduce((a, j) => a + j.overall_score, 0) / judgments.length
    : 0;

  const completedCases = run.passed + run.failed;
  const progressPct = run.total_cases > 0 ? Math.min(100, (completedCases / run.total_cases) * 100) : 0;
  const features = [...new Set(judgments.map((j) => j.feature))].sort();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main className="main-content" style={{ padding: "36px 40px 60px" }}>
        <div className="page-shell">
        <div className="animate-fade-up" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 28 }}>
          <div>
          <button
            onClick={() => navigate("/ci")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-dim)", fontSize: 12, marginBottom: 8, padding: 0 }}
          >
            ← CI Runs
          </button>
            <h1 className="font-display" style={{ fontSize: 28, fontWeight: 800, color: "var(--color-text)" }}>
              CI Run #{run.id}
            </h1>
            <p style={{ fontSize: 13, color: "var(--color-text-dim)", marginTop: 6 }}>
                {new Date(run.started_at).toLocaleString()}
                {duration !== null ? ` · ${duration}s` : " · running in background"}
            </p>
          </div>
          <div className="glass" style={{ borderRadius: 8, padding: "14px 20px", display: "flex", gap: 12, alignItems: "center" }}>
            {!run.finished_at && <span className="badge badge-mid">running</span>}
            <span className="badge badge-high">{run.passed} passed</span>
            {run.failed > 0 && <span className="badge badge-low">{run.failed} failed</span>}
            {judgments.length > 0 && scoreChip(avgScore, true)}
          </div>
        </div>

        <div className="glass animate-fade-up delay-1" style={{ borderRadius: 8, padding: "18px 20px", display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: "var(--color-text)" }}>
            <span style={{ fontWeight: 800 }}>{completedCases}</span> of <span style={{ fontWeight: 800 }}>{run.total_cases}</span> tests answered
          </div>
          <div style={{ flex: "1 1 220px", height: 6, borderRadius: 999, background: "rgba(17,24,39,0.08)", overflow: "hidden" }}>
            <div style={{ width: `${progressPct}%`, height: "100%", background: "#111827", transition: "width 0.35s ease" }} />
          </div>
          {features.map((feat) => {
            const fj = judgments.filter((j) => j.feature === feat);
            const favg = fj.reduce((a, j) => a + j.overall_score, 0) / fj.length;
            return (
              <div key={feat} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span className="font-mono" style={{ color: "var(--color-accent)", fontSize: 12 }}>{FEATURE_ICONS[feat] ?? "?"}</span>
                <span style={{ fontSize: 12, color: "var(--color-text-dim)", textTransform: "capitalize" }}>{feat}</span>
                <span className="font-mono" style={{ fontSize: 12, fontWeight: 800, color: favg >= 8 ? "var(--color-high)" : favg >= 6 ? "var(--color-mid)" : "var(--color-low)" }}>
                  {favg.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="animate-fade-up delay-2" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18 }}>
          <select
            value={filterFeature}
            onChange={(e) => setFilterFeature(e.target.value)}
            className="field"
            style={{ borderRadius: 8, padding: "8px 12px", fontSize: 13 }}
          >
            <option value="">All features</option>
            {features.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <div className="glass-light" style={{ display: "flex", borderRadius: 8, overflow: "hidden" }}>
            {(["all", "pass", "fail"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setFilterResult(v)}
                style={{
                  padding: "8px 12px",
                  fontSize: 13,
                  textTransform: "capitalize",
                  border: "none",
                  cursor: "pointer",
                  background: filterResult === v ? "#111827" : "transparent",
                  color: filterResult === v ? "white" : "var(--color-text-dim)",
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <span className="font-mono" style={{ fontSize: 11, color: "var(--color-text-dim)" }}>{filtered.length} shown</span>
        </div>

        {filtered.length === 0 ? (
          <div className="glass" style={{ borderRadius: 8, padding: "56px 16px", textAlign: "center", color: "var(--color-text-dim)", fontSize: 13 }}>
            {!run.finished_at ? "Waiting for the first completed test case..." : "No results match the current filters"}
          </div>
        ) : (
          <div className="animate-fade-up delay-3" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {filtered.map((j, i) => (
              <JudgmentCard key={j.id} judgment={j} index={i} />
            ))}
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
