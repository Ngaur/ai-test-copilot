"""
LLM + Embeddings client factory.

local  → plain httpx (direct to any OpenAI-compatible endpoint, e.g. Anthropic, Voyage AI)
deploy → httpx with http2=True (routes through LiteLLM proxy on the server)
ollama → plain httpx pointing to local Ollama OpenAI-compatible endpoint
"""
import httpx
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_ollama import OllamaEmbeddings

from app.core.config import settings


def _is_deploy() -> bool:
    return settings.env_mode == "deploy"


def _is_ollama() -> bool:
    return settings.env_mode == "ollama"


def _async_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(http2=_is_deploy())


def _sync_http_client() -> httpx.Client:
    return httpx.Client(http2=_is_deploy())


def get_llm() -> ChatOpenAI:
    # if _is_ollama():
    #     return ChatOpenAI(
    #         model=settings.llm_model,
    #         base_url=f"{settings.ollama_base_url}/v1",
    #         api_key="ollama",
    #         # temperature=settings.llm_temperature,
    #         # async_client=_async_http_client(),
    #         # http_client=_sync_http_client(),
    #         streaming=True,
    #     )
    return ChatOpenAI(
        model=settings.llm_model,
        #base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        temperature=settings.llm_temperature,
        # async_client=_async_http_client(),
        # http_client=_sync_http_client(),
        streaming=True,
    )


def get_embeddings() -> OpenAIEmbeddings:
    if _is_ollama():
        print("I am running via Ollama!")
        return OllamaEmbeddings(
            model=settings.embedding_model,
            base_url=f"{settings.ollama_base_url}",
            #api_key="ollama",
            # async_client=_async_http_client(),
            # http_client=_sync_http_client(),
        )
        # return OpenAIEmbeddings(
        #     model=settings.embedding_model,
        #     base_url=f"{settings.ollama_base_url}",
        #     api_key="ollama",
        #     # async_client=_async_http_client(),
        #     # http_client=_sync_http_client(),
        # )
    return OpenAIEmbeddings(
        model=settings.embedding_model,
        base_url=settings.embedding_base_url,
        api_key=settings.embedding_api_key,
        async_client=_async_http_client(),
        http_client=_sync_http_client(),
    )
