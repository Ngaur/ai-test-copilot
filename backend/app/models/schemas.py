from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class SessionStatus(str, Enum):
    IDLE = "idle"
    PARSING = "parsing"
    GENERATING = "generating"
    AWAITING_REVIEW = "awaiting_review"
    IMPROVING = "improving"
    GENERATING_SCHEMA = "generating_schema"
    AWAITING_EARLY_TEST_DATA = "awaiting_test_data_or_generate"
    AWAITING_TEST_DATA = "awaiting_test_data"
    GENERATING_AUTOMATION = "generating_automation"
    AWAITING_PLAYWRIGHT_CONFIRMATION = "awaiting_playwright_confirmation"
    READY_TO_EXECUTE = "ready_to_execute"
    EXECUTING = "executing"
    DONE = "done"
    ERROR = "error"


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: MessageRole
    content: str


class ChatRequest(BaseModel):
    session_id: str
    message: str
    thread_id: str | None = None


class ChatResponse(BaseModel):
    session_id: str
    thread_id: str
    message: str
    status: SessionStatus


class HumanReviewRequest(BaseModel):
    thread_id: str
    approved: bool
    feedback: str | None = None


class ResumeResponse(BaseModel):
    thread_id: str
    message: str
    status: SessionStatus


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

class TestStep(BaseModel):
    step_number: int
    action: str
    expected_result: str


class TestCase(BaseModel):
    id: str
    title: str
    module: str
    test_type: str  # Functional / Negative / Edge Case / Security
    priority: str   # P1-Critical / P2-High / P3-Medium / P4-Low
    preconditions: list[str]
    steps: list[TestStep]
    expected_result: str
    postconditions: list[str]
    notes: str = ""
    endpoint: str = ""
    http_method: str = ""


class TestSuite(BaseModel):
    suite_id: str
    title: str
    source: str
    test_cases: list[TestCase]
    coverage_gaps: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

class UploadResponse(BaseModel):
    file_id: str
    filename: str
    session_id: str
    message: str


class SessionStatusResponse(BaseModel):
    session_id: str
    thread_id: str | None
    status: SessionStatus
    test_cases_count: int = 0
    current_step: str = ""
    last_message: str = ""


# ---------------------------------------------------------------------------
# Test Execution
# ---------------------------------------------------------------------------

class TestDataUploadRequest(BaseModel):
    thread_id: str
    file_id: str


class ExecutionRequest(BaseModel):
    thread_id: str


class ExecutionStatusResponse(BaseModel):
    thread_id: str
    status: str
    passed: int = 0
    failed: int = 0
    errors: int = 0
    report_url: str | None = None
    log_lines: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Session History
# ---------------------------------------------------------------------------

class PastSession(BaseModel):
    session_id: str
    filename: str
    created_at: str
    updated_at: str
    has_feature_files: bool
    has_playwright: bool


class PastSessionTestCasesResponse(BaseModel):
    session_id: str
    count: int
    test_cases: list[TestCase]


class PastSessionContentResponse(BaseModel):
    session_id: str
    content: str
