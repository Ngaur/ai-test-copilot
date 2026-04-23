"""
FAISS vector store — singleton per session.
Sessions are keyed by session_id so each uploaded collection gets its own index.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document

from app.core.config import settings
from app.services.llm_service import get_embeddings

logger = logging.getLogger("apitests_ai.vector_store")

_stores: dict[str, FAISS] = {}


def _index_path(session_id: str) -> str:
    return os.path.join(settings.faiss_index_path, session_id)


def add_documents(session_id: str, docs: list[Document]) -> FAISS:
    embeddings = get_embeddings()
    store = FAISS.from_documents(docs, embeddings)
    store.save_local(_index_path(session_id))
    _stores[session_id] = store
    logger.info("Built FAISS index for session '%s' with %d chunks", session_id, len(docs))
    return store


def get_store(session_id: str) -> FAISS:
    if session_id in _stores:
        return _stores[session_id]
    index_path = _index_path(session_id)
    if Path(index_path).exists():
        store = FAISS.load_local(
            index_path,
            get_embeddings(),
            allow_dangerous_deserialization=True,
        )
        _stores[session_id] = store
        return store
    raise ValueError(f"No FAISS index found for session '{session_id}'. Upload a file first.")


def similarity_search(session_id: str, query: str, k: int | None = None) -> list[Document]:
    store = get_store(session_id)
    top_k = k or settings.retriever_top_k
    results = store.similarity_search(query, k=top_k)
    logger.debug("Retrieved %d chunks for query in session '%s'", len(results), session_id)
    return results
