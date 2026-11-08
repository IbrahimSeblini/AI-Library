import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { access_token } = await api.login(username, password);
      localStorage.setItem("judge_token", access_token);
      navigate("/");
    } catch {
      setError("Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="dot-grid"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Ambient orbs */}
      <div style={{
        position: "fixed", top: "20%", left: "30%",
        width: 400, height: 400, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(129,140,248,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "fixed", bottom: "20%", right: "25%",
        width: 300, height: 300, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div className="gradient-border animate-fade-up" style={{ width: "100%", maxWidth: 400 }}>
        <div className="glass" style={{ borderRadius: 16, padding: "40px 36px" }}>
          {/* Logo mark */}
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 56, height: 56, borderRadius: 14,
              background: "var(--color-accent-dim)",
              border: "1px solid var(--color-accent-glow)",
              marginBottom: 20,
              fontSize: 22,
            }}>
              ⚖
            </div>
            <h1 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text)" }}>
              AI Judge
            </h1>
            <p style={{ fontSize: 12, color: "var(--color-text-dim)", marginTop: 6, letterSpacing: "0.04em" }}>
              ADMIN ACCESS ONLY
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-dim)", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="field"
                style={{ width: "100%", borderRadius: 8, padding: "10px 14px", fontSize: 14 }}
                required
                autoFocus
                autoComplete="username"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-dim)", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
                style={{ width: "100%", borderRadius: 8, padding: "10px 14px", fontSize: 14 }}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "var(--color-low-dim)", border: "1px solid rgba(248,113,113,0.25)",
                borderRadius: 8, padding: "10px 14px",
              }}>
                <span style={{ color: "var(--color-low)", fontSize: 14 }}>⚠</span>
                <span style={{ color: "var(--color-low)", fontSize: 13 }}>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-glow"
              style={{ borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600, marginTop: 4 }}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span className="font-mono" style={{ animation: "pulse-dot 1s ease infinite" }}>···</span>
                  Authenticating
                </span>
              ) : "Sign in →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
