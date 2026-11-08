import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type CIRun, type CITestCase } from "../api";
import Sidebar from "../components/Sidebar";

export default function CIPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<CIRun[]>([]);
  const [testCases, setTestCases] = useState<CITestCase[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const hasRunningRun = runs.some((run) => !run.finished_at);

  async function refreshRuns() {
    const updated = await api.ciRuns(20);
    setRuns(updated);
  }

  useEffect(() => {
    Promise.all([api.ciRuns(20), api.ciTestCases()])
      .then(([r, t]) => { setRuns(r); setTestCases(t); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!hasRunningRun) return;
    const timer = window.setInterval(() => {
      refreshRuns().catch(console.error);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasRunningRun]);

  async function triggerRun() {
    setTriggering(true);
    setTriggerResult("");
    try {
      const result = await api.triggerCIRun();
      setTriggerResult(`Run #${result.id} started. You can keep using the dashboard while it runs.`);
      await refreshRuns();
    } catch (e: unknown) {
      setTriggerResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTriggering(false);
    }
  }

  async function deleteCase(id: number) {
    if (!confirm("Delete this test case?")) return;
    await api.deleteCITestCase(id);
    setTestCases((prev) => prev.filter((c) => c.id !== id));
  }

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

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main className="main-content" style={{ padding: "36px 40px 60px" }}>
        <div className="page-shell">
        <div className="animate-fade-up" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 32 }}>
          <div>
            <button
              onClick={() => navigate("/")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-dim)", fontSize: 12, marginBottom: 8, padding: 0 }}
            >
              ← Dashboard
            </button>
            <h1 className="font-display" style={{ fontSize: 28, fontWeight: 800, color: "var(--color-text)" }}>
              CI Pipeline
            </h1>
            <p style={{ fontSize: 13, color: "var(--color-text-dim)", marginTop: 6 }}>
              Regression checks for the judge service and AI features
            </p>
          </div>
          <button
            onClick={triggerRun}
            disabled={triggering || hasRunningRun}
            className="btn-glow"
            style={{ borderRadius: 8, padding: "11px 18px", fontSize: 13, fontWeight: 700, opacity: triggering || hasRunningRun ? 0.65 : 1 }}
          >
            {triggering ? "Starting..." : hasRunningRun ? "Run in progress" : "Run now"}
          </button>
        </div>

        {triggerResult && (
          <div
            className="animate-fade-up"
            style={{
              borderRadius: 8,
              border: `1px solid ${triggerResult.includes("Error") ? "rgba(201,42,42,0.18)" : "rgba(15,138,85,0.18)"}`,
              background: triggerResult.includes("Error") ? "var(--color-low-dim)" : "var(--color-high-dim)",
              color: triggerResult.includes("Error") ? "var(--color-low)" : "var(--color-high)",
              padding: "12px 16px",
              fontSize: 13,
              marginBottom: 18,
            }}
          >
            {triggerResult}
          </div>
        )}

        <div className="animate-fade-up delay-1" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 18, alignItems: "start" }}>
        <section className="glass" style={{ borderRadius: 8, padding: "22px 24px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
            <div className="font-display" style={{ fontSize: 15, fontWeight: 700 }}>Run history</div>
            <div className="font-mono" style={{ fontSize: 11, color: "var(--color-text-dim)" }}>{runs.length} recent</div>
          </div>
          {runs.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-dim)", padding: "38px 0", textAlign: "center" }}>No CI runs yet. Start one when you are ready.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => navigate(`/ci/runs/${run.id}`)}
                  className="glass-light"
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "center",
                    gap: 18,
                    borderRadius: 8,
                    padding: "14px 16px",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "border-color 0.2s, background 0.2s",
                  }}
                >
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)" }}>Run #{run.id}</span>
                    <span className="badge badge-dim" style={{ marginLeft: 8 }}>{run.triggered_by}</span>
                    {!run.finished_at && <span className="badge badge-mid" style={{ marginLeft: 8 }}>running</span>}
                    <div className="font-mono" style={{ fontSize: 11, color: "var(--color-text-dim)", marginTop: 5 }}>
                      {new Date(run.started_at).toLocaleString()}
                      {run.finished_at
                        ? ` — ${Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`
                        : " — running in background"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
                    <span className="badge badge-high">{run.passed} passed</span>
                    {run.failed > 0 && <span className="badge badge-low">{run.failed} failed</span>}
                    <span className="font-mono" style={{ color: "var(--color-text-dim)", fontSize: 11 }}>/ {run.total_cases}</span>
                    <span style={{ color: "var(--color-accent)", fontSize: 12, fontWeight: 700 }}>View</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="glass" style={{ borderRadius: 8, padding: "22px 24px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
            <div className="font-display" style={{ fontSize: 15, fontWeight: 700 }}>Test cases</div>
            <div className="font-mono" style={{ fontSize: 11, color: "var(--color-text-dim)" }}>{testCases.length} cases</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {testCases.map((tc) => (
              <div key={tc.id} className="glass-light" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", borderRadius: 8, padding: "12px 14px" }}>
                <div>
                  <span className="badge badge-accent" style={{ marginRight: 8 }}>
                    {tc.feature}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--color-text)" }}>{tc.description}</span>
                </div>
                <button
                  onClick={() => deleteCase(tc.id)}
                  style={{ background: "none", border: "none", color: "var(--color-text-dim)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
        </div>
        </div>
      </main>
    </div>
  );
}
