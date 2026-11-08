import { NavLink, useNavigate, useLocation } from "react-router-dom";

const FEATURES = [
  { key: "summary",          sym: "Σ",  label: "Summary"        },
  { key: "paraphrase",       sym: "↻",  label: "Paraphrase"     },
  { key: "quiz",             sym: "◉",  label: "Quiz"           },
  { key: "counterarguments", sym: "↯",  label: "Counter"        },
  { key: "librarian",        sym: "⊕",  label: "Librarian"      },
  { key: "roadmap_graph",    sym: "⊞",  label: "Roadmap Graph"  },
  { key: "roadmap_explain",  sym: "⊙",  label: "Roadmap Explain"},
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  function logout() {
    localStorage.removeItem("judge_token");
    navigate("/login");
  }

  return (
    <nav className="sidebar">
      {/* Brand */}
      <div style={{ padding: "24px 20px 20px" }}>
        <div className="font-display" style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.16em", color: "var(--color-accent)", textTransform: "uppercase" }}>
          AI Judge
        </div>
        <div style={{ fontSize: 10, color: "var(--color-text-dim)", marginTop: 3, letterSpacing: "0.08em" }}>
          MyLibraryPal · Quality Monitor
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--color-border)", margin: "0 16px 12px" }} />

      {/* Primary nav */}
      <div style={{ padding: "0 0 8px" }}>
        <div className="section-label" style={{ padding: "6px 24px 8px" }}>Navigation</div>
        <NavLink
          to="/"
          end
          className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
        >
          <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0 }}>◈</span>
          Overview
        </NavLink>
        <NavLink
          to="/ci"
          className={({ isActive }) => `sidebar-link${isActive || location.pathname.startsWith("/ci") ? " active" : ""}`}
        >
          <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0 }}>⌬</span>
          CI Pipeline
        </NavLink>
      </div>

      {/* Features */}
      <div style={{ padding: "8px 0" }}>
        <div className="section-label" style={{ padding: "6px 24px 8px" }}>Features</div>
        {FEATURES.map((f) => {
          const active = location.pathname === `/feature/${f.key}`;
          return (
            <NavLink
              key={f.key}
              to={`/feature/${f.key}`}
              className={`sidebar-link${active ? " active" : ""}`}
            >
              <span className="font-mono" style={{ fontSize: 11, width: 18, textAlign: "center", flexShrink: 0, color: active ? "var(--color-accent)" : "var(--color-text-muted)" }}>
                {f.sym}
              </span>
              {f.label}
            </NavLink>
          );
        })}
      </div>

      {/* Spacer + logout */}
      <div style={{ flex: 1 }} />
      <div style={{ padding: "12px 8px 24px", borderTop: "1px solid var(--color-border)" }}>
        <button
          onClick={logout}
          className="sidebar-link"
          style={{ width: "100%", background: "none", border: "1px solid transparent", cursor: "pointer" }}
        >
          <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0 }}>⎋</span>
          Sign out
        </button>
      </div>
    </nav>
  );
}
