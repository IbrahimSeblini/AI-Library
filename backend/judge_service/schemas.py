from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


# ── Inbound (from gateway background task) ──────────────────────────────────

class JudgeRequest(BaseModel):
    input_data: Dict[str, Any]
    output_data: Dict[str, Any]
    user_id: int = 0
    latency_ms: Optional[int] = None


# ── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Judgment ─────────────────────────────────────────────────────────────────

class JudgmentOut(BaseModel):
    id: int
    feature: str
    user_id: int
    source: str
    ci_run_id: Optional[int]
    test_case_id: Optional[int]
    test_case_description: Optional[str]
    input_data: Dict[str, Any]
    output_data: Dict[str, Any]
    scores: Dict[str, float]
    overall_score: float
    feedback: str
    model_used: str
    latency_ms: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class JudgmentListOut(BaseModel):
    items: List[JudgmentOut]
    total: int
    page: int
    page_size: int


# ── Stats ─────────────────────────────────────────────────────────────────────

class FeatureStats(BaseModel):
    feature: str
    avg_overall: float
    avg_scores: Dict[str, float]
    total_judgments: int
    last_7d_avg: Optional[float]
    delta_vs_prev_week: Optional[float]


class StatsOut(BaseModel):
    features: List[FeatureStats]


# ── CI Test Cases ─────────────────────────────────────────────────────────────

class CITestCaseCreate(BaseModel):
    feature: str
    description: str
    input_data: Dict[str, Any]


class CITestCaseOut(BaseModel):
    id: int
    feature: str
    description: str
    input_data: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


# ── CI Runs ───────────────────────────────────────────────────────────────────

class CIRunOut(BaseModel):
    id: int
    triggered_by: str
    started_at: datetime
    finished_at: Optional[datetime]
    total_cases: int
    passed: int
    failed: int
    judgments: Optional[List[JudgmentOut]] = None

    class Config:
        from_attributes = True
