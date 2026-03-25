"""
Settings endpoints.
- GET  /settings/jira         — retrieve saved Jira config (token masked)
- PUT  /settings/jira         — save Jira config
- POST /settings/jira/test    — test connection with supplied credentials
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.jira_service import JiraConfig, load_jira_config, save_jira_config, test_connection

router = APIRouter()


class JiraConfigPayload(BaseModel):
    server_url: str
    username: str
    api_token: str


@router.get("/settings/jira")
async def get_jira_settings():
    cfg = load_jira_config()
    if not cfg:
        return {"configured": False, "server_url": "", "username": "", "api_token": ""}
    return {"configured": True, **cfg.to_dict(mask_token=True)}


@router.put("/settings/jira")
async def save_jira_settings(body: JiraConfigPayload):
    cfg = JiraConfig(
        server_url=body.server_url.rstrip("/"),
        username=body.username,
        api_token=body.api_token,
    )
    save_jira_config(cfg)
    return {"ok": True, "message": "Jira settings saved."}


@router.post("/settings/jira/test")
async def test_jira_connection(body: JiraConfigPayload):
    cfg = JiraConfig(
        server_url=body.server_url.rstrip("/"),
        username=body.username,
        api_token=body.api_token,
    )
    ok, message = await test_connection(cfg)
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"ok": True, "message": message}
