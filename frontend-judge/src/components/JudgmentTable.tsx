import type { Judgment } from "../api";
import { useNavigate } from "react-router-dom";

const FEATURE_BADGE: Record<string, string> = {
  summary:          "badge-accent",
  paraphrase:       "badge-cyan",
  quiz:             "badge-purple",
  counterarguments: "badge-mid",
  librarian:        "badge-high",
  roadmap_graph:    "badge-cyan",
  roadmap_explain:  "badge-dim",
};

function scoreClass(s: number) {
  if (s >= 8) return "badge badge-high";
  if (s >= 6) return "badge badge-mid";
  return "badge badge-low";
}

interface Props {
  items: Judgment[];
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
}

export default function JudgmentTable({ items, total, page, pageSize, onPage }: Props) {
  const navigate = useNavigate();
  const pages = Math.ceil(total / pageSize);

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Feature</th>
              <th>Source</th>
              <th>User</th>
              <th>Score</th>
              <th>Latency</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "48px 16px", color: "var(--color-text-dim)" }}>
                  No judgments found
                </td>
              </tr>
            )}
            {items.map((j) => (
              <tr
                key={j.id}
                onClick={() => navigate(`/judgments/${j.id}`)}
              >
                <td>
                  <span className="font-mono" style={{ fontSize: 11, color: "var(--color-text-dim)" }}>
                    {new Date(j.created_at).toLocaleString("en-US", {
                      month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </td>
                <td>
                  <span className={`badge ${FEATURE_BADGE[j.feature] ?? "badge-dim"}`}>{j.feature}</span>
                </td>
                <td>
                  <span className={`badge ${j.source === "ci" ? "badge-purple" : "badge-dim"}`}>{j.source}</span>
                </td>
                <td>
                  <span className="font-mono" style={{ fontSize: 12, color: "var(--color-text-dim)" }}>
                    {j.user_id === 0 ? "CI" : `#${j.user_id}`}
                  </span>
                </td>
                <td>
                  <span className={scoreClass(j.overall_score)}>{j.overall_score.toFixed(1)}</span>
                </td>
                <td>
                  <span className="font-mono" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    {j.latency_ms != null ? `${j.latency_ms}ms` : "—"}
                  </span>
                </td>
                <td>
                  <span style={{ color: "var(--color-accent)", fontSize: 12, fontWeight: 500 }}>View →</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 20 }}>
          <button
            disabled={page === 1}
            onClick={() => onPage(page - 1)}
            className="glass-light"
            style={{
              border: "1px solid var(--color-border)", borderRadius: 8,
              padding: "6px 14px", fontSize: 12, cursor: "pointer",
              color: "var(--color-text-dim)", opacity: page === 1 ? 0.35 : 1,
            }}
          >
            ← Prev
          </button>
          <span className="font-mono" style={{ fontSize: 11, color: "var(--color-text-dim)", padding: "0 8px" }}>
            {page} / {pages}
          </span>
          <button
            disabled={page === pages}
            onClick={() => onPage(page + 1)}
            className="glass-light"
            style={{
              border: "1px solid var(--color-border)", borderRadius: 8,
              padding: "6px 14px", fontSize: 12, cursor: "pointer",
              color: "var(--color-text-dim)", opacity: page === pages ? 0.35 : 1,
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
