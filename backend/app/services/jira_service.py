"""
Jira integration service.

Supports both Jira Cloud (atlassian.net, REST API v3 + ADF descriptions)
and Jira Server / Data Center (REST API v2, plain-text descriptions).
"""
from __future__ import annotations

import base64
import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger("ai_test_copilot.jira")

# ---------------------------------------------------------------------------
# Config model (stored in data/jira_config.json)
# ---------------------------------------------------------------------------

_CONFIG_PATH = Path("data/jira_config.json")


@dataclass
class JiraConfig:
    server_url: str
    username: str
    api_token: str

    @property
    def is_cloud(self) -> bool:
        return ".atlassian.net" in self.server_url

    @property
    def api_base(self) -> str:
        version = "3" if self.is_cloud else "2"
        return f"{self.server_url.rstrip('/')}/rest/api/{version}"

    @property
    def auth_header(self) -> str:
        creds = base64.b64encode(f"{self.username}:{self.api_token}".encode()).decode()
        return f"Basic {creds}"

    def to_dict(self, mask_token: bool = False) -> dict:
        return {
            "server_url": self.server_url,
            "username": self.username,
            "api_token": "***" if mask_token and self.api_token else self.api_token,
        }


def load_jira_config() -> JiraConfig | None:
    """Load Jira config from disk. Returns None if not configured."""
    if not _CONFIG_PATH.exists():
        return None
    try:
        data = json.loads(_CONFIG_PATH.read_text())
        if not data.get("server_url") or not data.get("api_token"):
            return None
        return JiraConfig(**data)
    except Exception:
        return None


def save_jira_config(config: JiraConfig) -> None:
    _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG_PATH.write_text(json.dumps(config.to_dict(), indent=2))


# ---------------------------------------------------------------------------
# ADF → plain text converter (Atlassian Document Format, used by Jira Cloud)
# ---------------------------------------------------------------------------

def _adf_to_text(node: Any, _depth: int = 0) -> str:
    """Recursively convert an ADF node tree to readable plain text."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node

    ntype = node.get("type", "")
    children = node.get("content", [])

    if ntype == "text":
        return node.get("text", "")
    if ntype == "hardBreak":
        return "\n"
    if ntype in ("doc", "taskList", "expand", "table", "tableRow", "tableHeader", "tableCell"):
        return "".join(_adf_to_text(c, _depth) for c in children)
    if ntype == "paragraph":
        body = "".join(_adf_to_text(c, _depth) for c in children)
        return body + "\n"
    if ntype == "heading":
        level = node.get("attrs", {}).get("level", 2)
        body = "".join(_adf_to_text(c, _depth) for c in children)
        return "#" * level + " " + body.strip() + "\n"
    if ntype == "bulletList":
        return "".join("• " + _adf_to_text(c, _depth).strip() + "\n" for c in children)
    if ntype == "orderedList":
        lines = []
        for i, c in enumerate(children, 1):
            lines.append(f"{i}. " + _adf_to_text(c, _depth).strip())
        return "\n".join(lines) + "\n"
    if ntype == "listItem":
        return "".join(_adf_to_text(c, _depth) for c in children)
    if ntype == "codeBlock":
        lang = node.get("attrs", {}).get("language", "")
        body = "".join(_adf_to_text(c, _depth) for c in children)
        return f"```{lang}\n{body}\n```\n"
    if ntype == "blockquote":
        body = "".join(_adf_to_text(c, _depth) for c in children)
        return "> " + body.replace("\n", "\n> ")
    if ntype == "rule":
        return "---\n"
    if ntype == "mention":
        return node.get("attrs", {}).get("text", "@mention")
    if ntype in ("taskItem", "decisionItem"):
        done = node.get("attrs", {}).get("state", "") == "DONE"
        body = "".join(_adf_to_text(c, _depth) for c in children)
        return ("[x] " if done else "[ ] ") + body.strip() + "\n"
    # Fallback — recurse into children
    return "".join(_adf_to_text(c, _depth) for c in children)


def _field_to_text(value: Any, is_cloud: bool) -> str:
    """Convert a Jira field value (ADF dict or plain string) to text."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict) and is_cloud and value.get("type"):
        return _adf_to_text(value).strip()
    return str(value)


# ---------------------------------------------------------------------------
# Ticket fetcher
# ---------------------------------------------------------------------------

# Custom field keys commonly used for acceptance criteria (varies per instance)
_AC_FIELDS = [
    "customfield_10130",  # common in many Jira instances
    "customfield_10050",
    "customfield_10041",
    "customfield_10020",
    "customfield_10015",
]

_FETCH_FIELDS = ",".join([
    "summary", "description", "issuetype", "status", "priority",
    "labels", "comment", "assignee", "reporter",
] + _AC_FIELDS)


def _format_ticket(issue_key: str, fields: dict, is_cloud: bool) -> str:
    """Format a Jira issue as a structured plain-text context document."""
    lines: list[str] = [
        f"# Jira Ticket: {issue_key}",
        f"**Summary:** {fields.get('summary', '(no summary)')}",
        f"**Type:** {(fields.get('issuetype') or {}).get('name', 'Unknown')}",
        f"**Status:** {(fields.get('status') or {}).get('name', 'Unknown')}",
    ]

    priority = fields.get("priority")
    if priority:
        lines.append(f"**Priority:** {priority.get('name', 'Unknown')}")

    assignee = fields.get("assignee")
    if assignee:
        lines.append(f"**Assignee:** {assignee.get('displayName', '')}")

    labels = fields.get("labels") or []
    if labels:
        lines.append(f"**Labels:** {', '.join(labels)}")

    # Description
    desc = _field_to_text(fields.get("description"), is_cloud)
    if desc.strip():
        lines += ["", "## Description", desc.strip()]

    # Acceptance criteria — try known custom fields
    for cf in _AC_FIELDS:
        ac_raw = fields.get(cf)
        if ac_raw:
            ac_text = _field_to_text(ac_raw, is_cloud).strip()
            if ac_text:
                lines += ["", "## Acceptance Criteria", ac_text]
                break

    # Comments (most recent 5, non-empty)
    comment_block = fields.get("comment") or {}
    comments = comment_block.get("comments", []) if isinstance(comment_block, dict) else []
    recent = [c for c in comments[-5:] if c.get("body")]
    if recent:
        lines.append("\n## Comments")
        for c in recent:
            author = (c.get("author") or {}).get("displayName", "Unknown")
            body = _field_to_text(c.get("body"), is_cloud).strip()
            if body:
                lines += [f"\n**{author}:**", body]

    return "\n".join(lines)


async def fetch_ticket_as_text(config: JiraConfig, issue_key: str) -> str:
    """Fetch a Jira issue and return it as formatted plain text."""
    issue_key = issue_key.strip().upper()
    url = f"{config.api_base}/issue/{issue_key}?fields={_FETCH_FIELDS}"

    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        resp = await client.get(
            url,
            headers={"Authorization": config.auth_header, "Accept": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()

    fields = data.get("fields", {})
    return _format_ticket(issue_key, fields, config.is_cloud)


async def test_connection(config: JiraConfig) -> tuple[bool, str]:
    """Verify credentials by hitting the /myself endpoint. Returns (ok, message)."""
    url = f"{config.server_url.rstrip('/')}/rest/api/{'3' if config.is_cloud else '2'}/myself"
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(
                url,
                headers={"Authorization": config.auth_header, "Accept": "application/json"},
            )
        if resp.status_code == 200:
            name = resp.json().get("displayName", resp.json().get("name", ""))
            return True, f"Connected as {name}"
        return False, f"Authentication failed (HTTP {resp.status_code})"
    except httpx.ConnectError:
        return False, "Cannot reach Jira server. Check the URL."
    except Exception as exc:
        return False, str(exc)
