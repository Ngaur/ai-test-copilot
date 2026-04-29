"""
Report endpoint — serves per-session Allure HTML reports.
"""
import json
import mimetypes
import os
import subprocess

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from app.core.config import settings

router = APIRouter()


def _results_dir(session_id: str) -> str:
    return os.path.join(os.path.abspath(settings.allure_results_dir), session_id)


def _report_dir(session_id: str) -> str:
    return os.path.join(os.path.abspath(settings.allure_report_dir), session_id)


def generate_allure_report(session_id: str) -> None:
    """Run `allure generate` to produce a per-session HTML report."""
    results_dir = _results_dir(session_id)
    report_dir = _report_dir(session_id)
    os.makedirs(report_dir, exist_ok=True)
    subprocess.run(
        ["allure", "generate", results_dir, "--clean", "-o", report_dir],
        check=True,
        capture_output=True,
    )


@router.get("/report/view/{session_id}/{path:path}")
async def view_report(session_id: str, path: str = "index.html"):
    """Serve any file from the generated Allure report for a specific session."""
    if not path or path == "/":
        path = "index.html"
    base = _report_dir(session_id)
    full_path = os.path.join(base, path)
    # Prevent path traversal
    if not os.path.abspath(full_path).startswith(base):
        raise HTTPException(status_code=400, detail="Invalid path.")
    if not os.path.isfile(full_path):
        raise HTTPException(
            status_code=404,
            detail="Report not ready. Tests may still be running, or run tests first.",
        )
    mime, _ = mimetypes.guess_type(full_path)
    return FileResponse(full_path, media_type=mime or "application/octet-stream")


@router.get("/report/summary/{session_id}")
async def report_summary(session_id: str):
    """Return a JSON summary of the test results for a specific session."""
    summary_path = os.path.join(_report_dir(session_id), "widgets", "summary.json")
    if not os.path.exists(summary_path):
        raise HTTPException(
            status_code=404,
            detail="No report summary found for this session. Run tests first.",
        )
    with open(summary_path) as f:
        return json.load(f)


@router.get("/report/generate/{session_id}")
async def generate_report(session_id: str):
    """Manually regenerate the Allure HTML report for a session."""
    if not os.path.exists(_results_dir(session_id)):
        raise HTTPException(status_code=404, detail="No test results found. Run tests first.")
    try:
        generate_allure_report(session_id)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Allure report generation failed: {e.stderr.decode()}")
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="Allure CLI not found. Install via: npm install -g allure-commandline",
        )
    return JSONResponse({"report_url": f"/api/v1/report/view/{session_id}/index.html"})
