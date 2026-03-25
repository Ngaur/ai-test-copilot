"""
Document upload endpoints.
- POST /documents/upload      — upload Postman / OpenAPI / PDF / DOCX → returns session_id + file_id
- POST /documents/context     — upload supplementary context docs (MD, TXT, PDF, DOCX) before session start
- POST /documents/test-data   — upload CSV / Excel / JSON test data for a thread
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from pydantic import BaseModel

from app.api.deps import get_graph
from app.core.config import settings
from app.core.logging import logger
from app.models.schemas import UploadResponse
from app.services.jira_service import fetch_ticket_as_text, load_jira_config
from app.services.test_data_parser import parse_test_data

router = APIRouter()

ALLOWED_API_SPEC_TYPES = {
    "application/json",
    "application/x-yaml",
    "text/yaml",
    "text/plain",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",  # Postman collections sometimes come as octet-stream
}

ALLOWED_TEST_DATA_TYPES = {
    "text/csv",
    "application/json",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
}


@router.post("/documents/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile):
    """
    Upload an API spec or Postman collection to start a new session.
    Returns a session_id that is used for all subsequent chat messages.
    """
    session_id = str(uuid.uuid4())
    file_id = str(uuid.uuid4())

    upload_dir = Path(settings.upload_dir) / session_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    dest = upload_dir / file.filename
    content = await file.read()
    dest.write_bytes(content)

    logger.info("Uploaded file '%s' for session '%s'", file.filename, session_id)

    return UploadResponse(
        file_id=file_id,
        filename=file.filename,
        session_id=session_id,
        message=(
            f"File '{file.filename}' uploaded successfully. "
            "Use this session_id to start the chat and generate test cases."
        ),
    )


@router.post("/documents/context")
async def upload_context_document(session_id: str, file: UploadFile):
    """
    Upload a supplementary context document (feature spec, workflow guide, README, etc.)
    for a session BEFORE /chat/start is called.  Multiple files may be uploaded.
    All context docs are ingested alongside the main spec when the session starts.
    Accepted: .md, .txt, .pdf, .docx
    """
    context_dir = Path(settings.upload_dir) / session_id / "context"
    context_dir.mkdir(parents=True, exist_ok=True)

    dest = context_dir / file.filename
    dest.write_bytes(await file.read())

    logger.info("Context doc '%s' added to session '%s'", file.filename, session_id)
    return {
        "session_id": session_id,
        "filename": file.filename,
        "message": f"Context document '{file.filename}' added. Upload more or start the session.",
    }


class JiraFetchRequest(BaseModel):
    issue_keys: list[str]


@router.post("/documents/jira")
async def fetch_jira_tickets(session_id: str, body: JiraFetchRequest):
    """
    Fetch one or more Jira tickets and store them as context docs for the session.
    Each ticket is saved as jira_{KEY}.txt in uploads/{session_id}/context/,
    where it will be automatically ingested when the session starts.
    """
    cfg = load_jira_config()
    if not cfg:
        raise HTTPException(
            status_code=400,
            detail="Jira is not configured. Go to Settings and add your Jira credentials.",
        )

    context_dir = Path(settings.upload_dir) / session_id / "context"
    context_dir.mkdir(parents=True, exist_ok=True)

    fetched: list[str] = []
    errors: list[str] = []

    for key in body.issue_keys:
        key = key.strip().upper()
        if not key:
            continue
        try:
            text = await fetch_ticket_as_text(cfg, key)
            dest = context_dir / f"jira_{key}.txt"
            dest.write_text(text, encoding="utf-8")
            fetched.append(key)
            logger.info("Fetched Jira ticket %s for session %s", key, session_id)
        except Exception as exc:
            logger.warning("Failed to fetch Jira ticket %s: %s", key, exc)
            errors.append(f"{key}: {exc}")

    if not fetched and errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    return {
        "session_id": session_id,
        "fetched": fetched,
        "errors": errors,
        "message": (
            f"Fetched {len(fetched)} ticket(s): {', '.join(fetched)}."
            + (f" Errors: {'; '.join(errors)}" if errors else "")
        ),
    }


@router.post("/documents/test-data-early")
async def upload_early_test_data(
    thread_id: str,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    g=Depends(get_graph),
):
    """
    Upload test data BEFORE manual test case generation (optional early window).
    The graph is paused interrupt_before=["generate_test_cases"] after ingest_and_index.
    Stores the parsed test data in state then resumes the graph so generate_test_cases
    runs with the data already available.
    Returns immediately; frontend polls /status for progress.
    """
    upload_dir = Path(settings.upload_dir) / "test_data"
    upload_dir.mkdir(parents=True, exist_ok=True)

    dest = upload_dir / f"{thread_id}_{file.filename}"
    content = await file.read()
    dest.write_bytes(content)

    try:
        test_data = parse_test_data(str(dest))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse test data file: {exc}")

    config = {"configurable": {"thread_id": thread_id}}
    g.update_state(config, {"test_data_file_path": str(dest), "test_data": test_data})

    def _run_generation() -> None:
        try:
            # Resume from interrupt_before=["generate_test_cases"].
            # Runs: generate_test_cases (with test_data in state) → pauses before human_review.
            list(g.stream(None, config=config, stream_mode="values"))
        except Exception:
            logger.exception("Background early test generation failed for thread %s", thread_id)

    background_tasks.add_task(_run_generation)

    return {
        "thread_id": thread_id,
        "rows_loaded": len(test_data),
        "status": "generating",
        "message": (
            f"Loaded {len(test_data)} test data rows. Generating test cases with your data — "
            "poll /status for progress."
        ),
    }


@router.post("/documents/test-data")
async def upload_test_data(
    thread_id: str,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    g=Depends(get_graph),
):
    """
    Upload test data (CSV / Excel / JSON) and resume the LangGraph workflow.
    The graph is paused interrupt_before=["request_test_data"].
    Returns immediately; generate_automated_tests runs in a background task.
    Frontend should poll /status for progress.
    """
    upload_dir = Path(settings.upload_dir) / "test_data"
    upload_dir.mkdir(parents=True, exist_ok=True)

    dest = upload_dir / f"{thread_id}_{file.filename}"
    content = await file.read()
    dest.write_bytes(content)

    try:
        test_data = parse_test_data(str(dest))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse test data file: {exc}")

    config = {"configurable": {"thread_id": thread_id}}
    g.update_state(config, {"test_data_file_path": str(dest), "test_data": test_data})

    def _run_generation() -> None:
        try:
            from app.agents.nodes import generate_feature_files

            # Step 1: Resume from interrupt_before=["request_test_data"].
            # Runs: request_test_data → has_test_data → "has_data" → pauses before generate_automated_tests
            # (generate_automated_tests is in interrupt_before so the graph stops there)
            list(g.stream(None, config=config, stream_mode="values"))

            # Step 2: Progressive per-module feature file generation with live g.update_state() progress updates.
            # Pauses at awaiting_playwright_confirmation; user then decides whether to generate Playwright tests.
            state_snapshot = g.get_state(config)
            generate_feature_files(g, config, state_snapshot.values)

        except Exception:
            logger.exception("Background test generation failed for thread %s", thread_id)

    background_tasks.add_task(_run_generation)

    return {
        "thread_id": thread_id,
        "rows_loaded": len(test_data),
        "status": "generating_automation",
        "message": f"Loaded {len(test_data)} test data rows. Generating automated pytest tests — this may take a minute...",
    }
