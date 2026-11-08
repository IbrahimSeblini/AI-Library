from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Judgment(Base):
    __tablename__ = "judgments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    feature = Column(String, nullable=False, index=True)  # summary|paraphrase|quiz|counterarguments|librarian|roadmap
    user_id = Column(Integer, nullable=False, default=0, index=True)
    source = Column(String, nullable=False, default="live")  # live | ci
    ci_run_id = Column(Integer, ForeignKey("ci_runs.id"), nullable=True, index=True)
    input_data = Column(Text, nullable=False)   # JSON blob
    output_data = Column(Text, nullable=False)  # JSON blob
    scores = Column(Text, nullable=False)        # JSON blob {"metric": float, ...}
    overall_score = Column(Float, nullable=False)
    feedback = Column(Text, nullable=False, default="")
    model_used = Column(String, nullable=False, default="gemini-2.5-flash")
    latency_ms = Column(Integer, nullable=True)
    test_case_id = Column(Integer, ForeignKey("ci_test_cases.id"), nullable=True)
    test_case_description = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class CITestCase(Base):
    __tablename__ = "ci_test_cases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    feature = Column(String, nullable=False, index=True)
    description = Column(String, nullable=False)
    input_data = Column(Text, nullable=False)  # JSON blob matching feature's request schema
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class CIRun(Base):
    __tablename__ = "ci_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    triggered_by = Column(String, nullable=False, default="manual")  # github_actions | manual
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    total_cases = Column(Integer, nullable=False, default=0)
    passed = Column(Integer, nullable=False, default=0)   # overall_score >= 7.0
    failed = Column(Integer, nullable=False, default=0)
