"""
Sessions history API.

All data is sourced from the SQLite session registry or the filesystem — these
endpoints do NOT touch LangGraph's in-memory state, so they work even after a
server restart.

GET    /sessions                              → list recent sessions (metadata only)
DELETE /sessions/{session_id}                 → delete a session from registry
GET    /sessions/{session_id}/test-cases      → saved manual test cases from registry
GET    /sessions/{session_id}/feature-files   → Gherkin .feature file content from disk
GET    /sessions/{session_id}/playwright-test → test_generated.py content from disk
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.models.schemas import (
    PastSession,
    PastSessionContentResponse,
    PastSessionTestCasesResponse,
    TestCase,
)
from app.services.session_registry import registry

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /sessions
# ---------------------------------------------------------------------------

@router.get("/sessions", response_model=list[PastSession])
async def list_sessions():
    """Return all past sessions ordered by most recently updated."""
    rows = registry.list_sessions()
    return [
        PastSession(
            session_id=r["session_id"],
            filename=r["filename"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
            has_feature_files=bool(r["has_feature_files"]),
            has_playwright=bool(r["has_playwright"]),
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# DELETE /sessions/{session_id}
# ---------------------------------------------------------------------------

@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Remove a session from the registry (test cases included). Disk files are kept."""
    if not registry.session_exists(session_id):
        raise HTTPException(status_code=404, detail="Session not found.")
    deleted = registry.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete session.")
    return {"ok": True, "session_id": session_id}


# ---------------------------------------------------------------------------
# GET /sessions/{session_id}/test-cases
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/test-cases", response_model=PastSessionTestCasesResponse)
async def get_session_test_cases(session_id: str):
    """Return saved manual test cases for a past session from the registry."""
    if not registry.session_exists(session_id):
        raise HTTPException(status_code=404, detail="Session not found in registry.")

    raw = registry.get_test_cases(session_id)
    if not raw:
        raise HTTPException(
            status_code=404,
            detail="No test cases saved for this session. They may not have been approved yet.",
        )

    test_cases = [TestCase(**tc) for tc in raw]
    return PastSessionTestCasesResponse(
        session_id=session_id,
        count=len(test_cases),
        test_cases=test_cases,
    )


# ---------------------------------------------------------------------------
# GET /sessions/{session_id}/feature-files
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/feature-files", response_model=PastSessionContentResponse)
async def get_session_feature_files(session_id: str):
    """Return concatenated Gherkin .feature file content from disk."""
    features_dir = Path(settings.generated_tests_dir) / session_id / "features"

    if not features_dir.exists():
        raise HTTPException(status_code=404, detail="Feature files directory not found.")

    feature_files = sorted(features_dir.glob("*.feature"))
    if not feature_files:
        raise HTTPException(status_code=404, detail="No .feature files found for this session.")

    parts: list[str] = []
    for f in feature_files:
        try:
            parts.append(f"# === {f.name} ===\n\n{f.read_text(encoding='utf-8')}")
        except Exception:
            parts.append(f"# === {f.name} === (read error)\n")

    return PastSessionContentResponse(
        session_id=session_id,
        content="\n\n".join(parts),
    )


# ---------------------------------------------------------------------------
# GET /sessions/{session_id}/playwright-test
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/playwright-test", response_model=PastSessionContentResponse)
async def get_session_playwright_test(session_id: str):
    """Return test_generated.py content from disk."""
    py_file = Path(settings.generated_tests_dir) / session_id / "test_generated.py"

    if not py_file.exists():
        raise HTTPException(
            status_code=404,
            detail="Playwright test file not found for this session.",
        )

    return PastSessionContentResponse(
        session_id=session_id,
        content=py_file.read_text(encoding="utf-8"),
    )
