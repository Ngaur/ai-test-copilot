"""
Report endpoint — serves the Allure HTML report.
"""
import json
import mimetypes
import os
import subprocess

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from app.core.config import settings

router = APIRouter()

REPORT_URL_PREFIX = "/api/v1/report/view"


def _report_dir() -> str:
    return os.path.abspath(settings.allure_report_dir)


def generate_allure_report() -> None:
    """Run `allure generate` to produce HTML from results. Raises on failure."""
    results_dir = os.path.abspath(settings.allure_results_dir)
    report_dir = _report_dir()
    subprocess.run(
        ["allure", "generate", results_dir, "--clean", "-o", report_dir],
        check=True,
        capture_output=True,
    )


@router.get("/report/generate")
async def generate_report():
    """Generate Allure HTML report from allure-results directory."""
    if not os.path.exists(settings.allure_results_dir):
        raise HTTPException(status_code=404, detail="No test results found. Run tests first.")
    try:
        generate_allure_report()
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Allure report generation failed: {e.stderr.decode()}")
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="Allure CLI not found. Install via: npm install -g allure-commandline",
        )
    return JSONResponse({"report_url": f"{REPORT_URL_PREFIX}/index.html"})


@router.get("/report/view/{path:path}")
async def view_report(path: str = "index.html"):
    """Serve any file from the generated Allure report directory."""
    if not path or path == "/":
        path = "index.html"
    full_path = os.path.join(_report_dir(), path)
    # Prevent path traversal
    if not os.path.abspath(full_path).startswith(_report_dir()):
        raise HTTPException(status_code=400, detail="Invalid path.")
    if not os.path.isfile(full_path):
        raise HTTPException(
            status_code=404,
            detail="Report not ready. Tests may still be running, or run /report/generate first.",
        )
    mime, _ = mimetypes.guess_type(full_path)
    return FileResponse(full_path, media_type=mime or "application/octet-stream")


@router.get("/report/summary")
async def report_summary():
    """Return a JSON summary of the latest test results."""
    summary_path = os.path.join(_report_dir(), "widgets", "summary.json")
    if not os.path.exists(summary_path):
        raise HTTPException(status_code=404, detail="No report summary found. Generate the report first.")
    with open(summary_path) as f:
        return json.load(f)
