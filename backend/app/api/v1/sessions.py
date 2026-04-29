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
POST   /sessions/{session_id}/re-execute      → re-run pytest for a past session
GET    /sessions/{session_id}/execution-status → poll execution status
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.api.v1.report import generate_allure_report
from app.core.config import settings
from app.core.logging import logger
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
            has_execution=bool(r.get("has_execution", 0)),
            execution_status=r.get("execution_status"),
            has_load_tests=bool(r.get("has_load_tests", 0)),
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


# ---------------------------------------------------------------------------
# POST /sessions/{session_id}/re-execute
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/re-execute")
async def re_execute_session(session_id: str, background_tasks: BackgroundTasks):
    """
    Re-run the pytest test suite for a past session.
    Finds test_generated.py on disk, runs pytest, regenerates the Allure report.
    Returns immediately; poll /sessions/{session_id}/execution-status for progress.
    """
    if not registry.session_exists(session_id):
        raise HTTPException(status_code=404, detail="Session not found.")

    py_file = Path(settings.generated_tests_dir) / session_id / "test_generated.py"
    if not py_file.exists():
        raise HTTPException(
            status_code=404,
            detail="No generated test file found for this session. Generate Playwright tests first.",
        )

    registry.set_execution_status(session_id, "running")

    def _run() -> None:
        try:
            allure_results = str(Path(settings.allure_results_dir) / session_id)
            if Path(allure_results).exists():
                shutil.rmtree(allure_results)
            Path(allure_results).mkdir(parents=True, exist_ok=True)

            result = subprocess.run(
                [
                    "python", "-m", "pytest",
                    str(py_file),
                    "--alluredir", allure_results,
                    "-p", "no:allure_pytest_bdd",
                    "-v",
                    "--tb=short",
                ],
                capture_output=True,
                text=True,
                timeout=300,
            )

            status = "passed" if result.returncode == 0 else "failed"

            try:
                generate_allure_report(session_id)
            except Exception:
                logger.warning("Allure report generation failed for session %s", session_id)

            registry.mark_has_execution(session_id, status)

        except subprocess.TimeoutExpired:
            registry.mark_has_execution(session_id, "error")
        except Exception:
            logger.exception("Re-execute failed for session %s", session_id)
            registry.mark_has_execution(session_id, "error")

    background_tasks.add_task(_run)
    return {"session_id": session_id, "status": "started"}


# ---------------------------------------------------------------------------
# GET /sessions/{session_id}/execution-status
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/execution-status")
async def get_session_execution_status(session_id: str):
    """Return the current execution_status for a session (used to poll re-execute progress)."""
    if not registry.session_exists(session_id):
        raise HTTPException(status_code=404, detail="Session not found.")

    row = registry.get_execution_status(session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    return {
        "session_id": session_id,
        "has_execution": bool(row["has_execution"]),
        "execution_status": row["execution_status"],
    }


# ---------------------------------------------------------------------------
# GET /sessions/{session_id}/load-tests
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/load-tests")
async def get_session_load_tests(session_id: str):
    """Return all load test scripts for a past session (reads manifest.json from disk)."""
    if not registry.session_exists(session_id):
        raise HTTPException(status_code=404, detail="Session not found.")

    load_tests_dir = Path(settings.generated_tests_dir) / session_id / "load_tests"
    if not load_tests_dir.exists():
        return {"load_tests": []}

    manifest_path = load_tests_dir / "manifest.json"
    if not manifest_path.exists():
        return {"load_tests": []}

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return {"load_tests": []}

    result = []
    for entry in manifest.get("load_tests", []):
        js_path = load_tests_dir / entry["file"]
        content = ""
        if js_path.exists():
            try:
                content = js_path.read_text(encoding="utf-8")
            except Exception:
                pass
        result.append({
            "id": entry.get("id"),
            "name": entry.get("name"),
            "endpoints": entry.get("endpoints", []),
            "file_path": str(js_path),
            "content": content,
            "vus": entry.get("vus", 10),
            "duration": entry.get("duration", "2m"),
            "ramp_up": entry.get("ramp_up", "30s"),
            "ramp_down": entry.get("ramp_down", "30s"),
            "p95_ms": entry.get("p95_ms", 500),
            "p99_ms": entry.get("p99_ms", 1000),
            "error_rate_pct": entry.get("error_rate_pct", 1.0),
        })

    return {"load_tests": result}
