from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Support running uvicorn from backend/ (../.env) or project root (.env)
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
    )

    app_name: str = "APITests.ai"
    debug: bool = False

    # Deployment mode
    # "local"  → plain httpx, direct API connections (Anthropic, Voyage AI, etc.)
    # "deploy" → httpx with http2=True, routes through LiteLLM proxy
    # "ollama" → plain httpx, local Ollama instance (http://localhost:11434)
    env_mode: str = "local"

    # LLM (OpenAI-compatible endpoint)
    llm_base_url: str = "http://localhost:4000"
    llm_api_key: str = "sk-litellm"
    llm_model: str = "gpt-4o"
    llm_temperature: float = 0.0

    # Embeddings (OpenAI-compatible endpoint)
    embedding_base_url: str = "http://localhost:4000"
    embedding_api_key: str = "sk-litellm"
    embedding_model: str = "text-embedding-3-small"

    # Ollama (used when env_mode=ollama)
    ollama_base_url: str = "http://localhost:11434"

    # FAISS
    faiss_index_path: str = "data/faiss_index"
    chunk_size: int = 1024
    chunk_overlap: int = 128
    retriever_top_k: int = 8

    # Batch generation — endpoints per LLM call for structured files (Postman / OpenAPI)
    endpoint_batch_size: int = 5

    # File uploads
    upload_dir: str = "data/uploads"
    max_upload_size_mb: int = 20

    # Generated tests output — stored OUTSIDE backend/ to avoid uvicorn hot-reload on file change
    generated_tests_dir: str = "../artifacts/generated_tests"
    allure_results_dir: str = "../artifacts/allure-results"
    allure_report_dir: str = "../artifacts/allure-report"

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # Auth (future-proofing)
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60


settings = Settings()
