from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import router as v1_router
from app.core.config import settings
from app.core.logging import setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging(debug=settings.debug)
    import os
    os.makedirs(settings.upload_dir, exist_ok=True)
    os.makedirs(settings.faiss_index_path, exist_ok=True)
    os.makedirs(settings.generated_tests_dir, exist_ok=True)
    os.makedirs(settings.allure_results_dir, exist_ok=True)
    yield


app = FastAPI(
    title=settings.app_name,
    description="AI-powered test case generation and automation copilot",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api/v1")
