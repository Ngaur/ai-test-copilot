from fastapi import APIRouter

from app.api.v1 import chat, documents, health, report, sessions, settings

router = APIRouter()

router.include_router(health.router, tags=["health"])
router.include_router(documents.router, tags=["documents"])
router.include_router(chat.router, tags=["chat"])
router.include_router(report.router, tags=["report"])
router.include_router(settings.router, tags=["settings"])
router.include_router(sessions.router, tags=["sessions"])
