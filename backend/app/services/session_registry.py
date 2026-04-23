"""
SQLite-backed session registry.

Persists session metadata and approved test cases across server restarts so that
the sidebar can display a history of past sessions and the SessionViewer can
reconstruct their content without relying on LangGraph's in-memory MemorySaver.

DB location: data/session_registry.db  (same data/ directory as uploads & FAISS)

Tables
------
sessions   — one row per session_id; tracks filename, timestamps, and artifact flags
test_cases — one row per test case; linked to session_id; written on user approval
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone

logger = logging.getLogger("apitests_ai.session_registry")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class SessionRegistry:
    """Thread-safe SQLite session store."""

    _DDL = """
    CREATE TABLE IF NOT EXISTS sessions (
        session_id        TEXT PRIMARY KEY,
        filename          TEXT NOT NULL,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        has_feature_files INTEGER NOT NULL DEFAULT 0,
        has_playwright    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS test_cases (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id       TEXT NOT NULL,
        test_case_json   TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_test_cases_session
        ON test_cases (session_id);
    """

    def __init__(self, db_path: str) -> None:
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self._db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._lock:
            with self._connect() as conn:
                conn.executescript(self._DDL)

    # ------------------------------------------------------------------
    # Write methods
    # ------------------------------------------------------------------

    def upsert_session(self, session_id: str, filename: str) -> None:
        """Register a new session (or refresh updated_at if it already exists)."""
        now = _now_iso()
        with self._lock:
            try:
                with self._connect() as conn:
                    conn.execute(
                        """
                        INSERT INTO sessions (session_id, filename, created_at, updated_at)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(session_id) DO UPDATE SET updated_at = excluded.updated_at
                        """,
                        (session_id, filename, now, now),
                    )
            except Exception:
                logger.exception("upsert_session failed for %s", session_id)

    def save_test_cases(self, session_id: str, test_cases: list[dict]) -> None:
        """Replace the stored test cases for a session (called on user approval)."""
        if not session_id:
            return
        now = _now_iso()
        with self._lock:
            try:
                with self._connect() as conn:
                    conn.execute("DELETE FROM test_cases WHERE session_id = ?", (session_id,))
                    conn.executemany(
                        "INSERT INTO test_cases (session_id, test_case_json) VALUES (?, ?)",
                        [(session_id, json.dumps(tc)) for tc in test_cases],
                    )
                    conn.execute(
                        "UPDATE sessions SET updated_at = ? WHERE session_id = ?",
                        (now, session_id),
                    )
            except Exception:
                logger.exception("save_test_cases failed for %s", session_id)

    def mark_has_feature_files(self, session_id: str) -> None:
        """Set has_feature_files=1 after feature file generation completes."""
        if not session_id:
            return
        now = _now_iso()
        with self._lock:
            try:
                with self._connect() as conn:
                    conn.execute(
                        "UPDATE sessions SET has_feature_files = 1, updated_at = ? WHERE session_id = ?",
                        (now, session_id),
                    )
            except Exception:
                logger.exception("mark_has_feature_files failed for %s", session_id)

    def mark_has_playwright(self, session_id: str) -> None:
        """Set has_playwright=1 after Playwright test generation completes."""
        if not session_id:
            return
        now = _now_iso()
        with self._lock:
            try:
                with self._connect() as conn:
                    conn.execute(
                        "UPDATE sessions SET has_playwright = 1, updated_at = ? WHERE session_id = ?",
                        (now, session_id),
                    )
            except Exception:
                logger.exception("mark_has_playwright failed for %s", session_id)

    # ------------------------------------------------------------------
    # Read methods
    # ------------------------------------------------------------------

    def list_sessions(self) -> list[dict]:
        """Return all sessions ordered by most-recently updated, newest first."""
        with self._lock:
            try:
                with self._connect() as conn:
                    rows = conn.execute(
                        """
                        SELECT session_id, filename, created_at, updated_at,
                               has_feature_files, has_playwright
                        FROM sessions
                        ORDER BY updated_at DESC
                        LIMIT 50
                        """
                    ).fetchall()
                return [dict(r) for r in rows]
            except Exception:
                logger.exception("list_sessions failed")
                return []

    def get_test_cases(self, session_id: str) -> list[dict]:
        """Return parsed test case dicts for a session."""
        with self._lock:
            try:
                with self._connect() as conn:
                    rows = conn.execute(
                        "SELECT test_case_json FROM test_cases WHERE session_id = ? ORDER BY id",
                        (session_id,),
                    ).fetchall()
                return [json.loads(r["test_case_json"]) for r in rows]
            except Exception:
                logger.exception("get_test_cases failed for %s", session_id)
                return []

    def session_exists(self, session_id: str) -> bool:
        """Return True if the session_id is in the registry."""
        with self._lock:
            try:
                with self._connect() as conn:
                    row = conn.execute(
                        "SELECT 1 FROM sessions WHERE session_id = ?", (session_id,)
                    ).fetchone()
                return row is not None
            except Exception:
                return False

    def delete_session(self, session_id: str) -> bool:
        """Delete a session and all its test cases from the registry. Returns True if deleted."""
        with self._lock:
            try:
                with self._connect() as conn:
                    conn.execute("DELETE FROM test_cases WHERE session_id = ?", (session_id,))
                    result = conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
                    conn.commit()
                    return result.rowcount > 0
            except Exception:
                logger.exception("delete_session failed for %s", session_id)
                return False


# ---------------------------------------------------------------------------
# Module-level singleton — import and use `registry` directly.
# ---------------------------------------------------------------------------

def _resolve_db_path() -> str:
    # Import here to avoid circular imports at module load time
    from app.core.config import settings
    # settings.upload_dir is "data/uploads" (relative to backend/ cwd)
    # We want data/session_registry.db, i.e. the parent of upload_dir
    data_dir = os.path.dirname(os.path.abspath(settings.upload_dir))
    return os.path.join(data_dir, "session_registry.db")


registry = SessionRegistry(_resolve_db_path())
