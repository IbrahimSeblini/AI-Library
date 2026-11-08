const BASE = "/judge-api";

function token() {
  return localStorage.getItem("judge_token") ?? "";
}

function authHeaders() {
  return { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers ?? {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem("judge_token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => "Error");
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    req<{ access_token: string }>("/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  stats: () => req<{ features: FeatureStats[] }>("/stats"),

  judgments: (params: JudgmentsParams) => {
    const p = new URLSearchParams();
    if (params.feature) p.set("feature", params.feature);
    if (params.source) p.set("source", params.source);
    if (params.from_date) p.set("from_date", params.from_date);
    if (params.to_date) p.set("to_date", params.to_date);
    p.set("page", String(params.page ?? 1));
    p.set("page_size", String(params.page_size ?? 20));
    return req<JudgmentList>(`/judgments?${p}`);
  },

  judgment: (id: number) => req<Judgment>(`/judgments/${id}`),

  ciTestCases: () => req<CITestCase[]>("/ci/test-cases"),

  createCITestCase: (body: { feature: string; description: string; input_data: Record<string, unknown> }) =>
    req<CITestCase>("/ci/test-cases", { method: "POST", body: JSON.stringify(body) }),

  deleteCITestCase: (id: number) =>
    req<void>(`/ci/test-cases/${id}`, { method: "DELETE" }),

  ciRuns: (limit = 20) => req<CIRun[]>(`/ci/runs?limit=${limit}`),

  ciRun: (id: number) => req<CIRun & { judgments: Judgment[] }>(`/ci/runs/${id}`),

  triggerCIRun: () =>
    fetch(BASE + "/ci/run?triggered_by=manual", {
      method: "POST",
      headers: { "X-Internal-Key": "changeme-judge" },
    }).then((r) => r.json()),
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeatureStats {
  feature: string;
  avg_overall: number;
  avg_scores: Record<string, number>;
  total_judgments: number;
  last_7d_avg: number | null;
  delta_vs_prev_week: number | null;
}

export interface Judgment {
  id: number;
  feature: string;
  user_id: number;
  source: string;
  ci_run_id: number | null;
  test_case_id: number | null;
  test_case_description: string | null;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  scores: Record<string, number>;
  overall_score: number;
  feedback: string;
  model_used: string;
  latency_ms: number | null;
  created_at: string;
}

export interface JudgmentList {
  items: Judgment[];
  total: number;
  page: number;
  page_size: number;
}

export interface JudgmentsParams {
  feature?: string;
  source?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
}

export interface CITestCase {
  id: number;
  feature: string;
  description: string;
  input_data: Record<string, unknown>;
  created_at: string;
}

export interface CIRun {
  id: number;
  triggered_by: string;
  started_at: string;
  finished_at: string | null;
  total_cases: number;
  passed: number;
  failed: number;
  judgments?: Judgment[];
}
