"""
Ingestor — parses uploaded files into LangChain Documents.

Supported formats:
  - Postman Collection v2.1 (.json)
  - OpenAPI / Swagger spec (.json / .yaml)
  - Word documents (.docx)
  - PDF (.pdf)
  - Plain text / Markdown (.txt / .md)
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import yaml
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import settings

logger = logging.getLogger("apitests_ai.ingestor")


# ---------------------------------------------------------------------------
# Postman Collection Parser
# ---------------------------------------------------------------------------

def _flatten_postman_items(items: list[dict], prefix: str = "") -> list[dict]:
    """Recursively flatten Postman collection folders into a flat endpoint list."""
    endpoints = []
    for item in items:
        name = item.get("name", "")
        if "item" in item:
            # Folder — recurse
            endpoints.extend(_flatten_postman_items(item["item"], prefix=f"{prefix}{name}/"))
        else:
            request = item.get("request", {})
            response_examples = item.get("response", [])
            endpoints.append({
                "name": f"{prefix}{name}",
                "method": request.get("method", "GET"),
                "url": _extract_postman_url(request.get("url", {})),
                "headers": request.get("header", []),
                "body": request.get("body", {}),
                "description": request.get("description", ""),
                "responses": [
                    {
                        "name": r.get("name", ""),
                        "status": r.get("status", ""),
                        "code": r.get("code", 0),
                        "body": r.get("body", ""),
                    }
                    for r in response_examples
                ],
            })
    return endpoints


def _extract_postman_url(url: dict | str) -> str:
    if isinstance(url, str):
        return url
    if isinstance(url, dict):
        raw = url.get("raw", "")
        return raw
    return ""


def _parse_postman_body_fields(body: dict) -> list[str]:
    """Extract request body field names from a Postman body object by mode."""
    if not body:
        return []
    mode = body.get("mode", "")
    if mode == "raw":
        try:
            raw = json.loads(body.get("raw", "{}") or "{}")
            if isinstance(raw, dict):
                return list(raw.keys())
        except (json.JSONDecodeError, TypeError):
            pass
    elif mode == "formdata":
        return [item["key"] for item in body.get("formdata", []) if "key" in item]
    elif mode == "urlencoded":
        return [item["key"] for item in body.get("urlencoded", []) if "key" in item]
    return []


def _extract_postman_headers(headers: list) -> dict:
    """Convert [{key, value}] header list to {key: value} dict; keeps {{vars}} as-is."""
    return {h["key"]: h.get("value", "") for h in headers if h.get("key")}


def _extract_postman_request_payload(body: dict) -> Any:
    """Return parsed JSON ({{var}} strings survive as string values), form dict, or raw string."""
    if not body:
        return None
    mode = body.get("mode", "")
    if mode == "raw":
        raw = body.get("raw", "")
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return raw or None
    elif mode in ("formdata", "urlencoded"):
        return {i["key"]: i.get("value", "") for i in body.get(mode, []) if "key" in i}
    return None


def _extract_postman_response_payloads(responses: list) -> dict:
    """Return {status_code_str: parsed_body_or_raw_str} for each saved response example."""
    result = {}
    for r in responses:
        code = str(r.get("code", ""))
        body = r.get("body", "")
        if code:
            try:
                result[code] = json.loads(body) if body else None
            except (json.JSONDecodeError, TypeError):
                result[code] = body
    return result


def parse_postman_collection(path: Path) -> list[Document]:
    data = json.loads(path.read_text(encoding="utf-8"))
    collection_name = data.get("info", {}).get("name", path.stem)
    items = data.get("item", [])
    endpoints = _flatten_postman_items(items)

    docs = []
    for ep in endpoints:
        content_parts = [
            f"Collection: {collection_name}",
            f"Endpoint: {ep['name']}",
            f"Method: {ep['method']}",
            f"URL: {ep['url']}",
        ]
        if ep["description"]:
            content_parts.append(f"Description: {ep['description']}")
        if ep["body"]:
            content_parts.append(f"Request Body: {json.dumps(ep['body'], indent=2)}")
        for resp in ep["responses"]:
            content_parts.append(
                f"Response [{resp['code']} {resp['status']}]: {resp['body']}"
            )
        docs.append(
            Document(
                page_content="\n".join(content_parts),
                metadata={
                    "source": collection_name,
                    "endpoint": ep["name"],
                    "method": ep["method"],
                    "url": ep["url"],
                    "type": "postman",
                    "body_fields": _parse_postman_body_fields(ep["body"]),
                    "headers": _extract_postman_headers(ep["headers"]),
                    "request_payload": _extract_postman_request_payload(ep["body"]),
                    "response_payload": _extract_postman_response_payloads(ep["responses"]),
                },
            )
        )
    logger.info("Parsed %d endpoints from Postman collection '%s'", len(docs), collection_name)
    return docs


# ---------------------------------------------------------------------------
# OpenAPI / Swagger Parser
# ---------------------------------------------------------------------------

def parse_openapi_spec(path: Path) -> list[Document]:
    text = path.read_text(encoding="utf-8")
    data: dict[str, Any] = yaml.safe_load(text) if path.suffix in (".yaml", ".yml") else json.loads(text)

    title = data.get("info", {}).get("title", path.stem)
    paths = data.get("paths", {})
    docs = []

    for path_str, methods in paths.items():
        for method, operation in methods.items():
            if method.upper() not in {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}:
                continue
            content_parts = [
                f"API: {title}",
                f"Endpoint: {path_str}",
                f"Method: {method.upper()}",
                f"Summary: {operation.get('summary', '')}",
                f"Description: {operation.get('description', '')}",
            ]
            params = operation.get("parameters", [])
            if params:
                content_parts.append("Parameters: " + json.dumps(params, indent=2))
            req_body = operation.get("requestBody", {})
            openapi_body_fields: list[str] = []
            if req_body:
                content_parts.append("Request Body Schema: " + json.dumps(req_body, indent=2))
                # Extract field names from the first JSON schema found
                for _media_obj in req_body.get("content", {}).values():
                    props = _media_obj.get("schema", {}).get("properties", {})
                    if props:
                        openapi_body_fields = list(props.keys())
                        break
            responses = operation.get("responses", {})
            for status_code, resp_obj in responses.items():
                content_parts.append(
                    f"Response {status_code}: {json.dumps(resp_obj, indent=2)}"
                )

            # Extract structured metadata for api_metadata_map
            openapi_headers = {
                p["name"]: json.dumps(p.get("schema", {}))
                for p in params
                if p.get("in") == "header" and p.get("name")
            }
            openapi_request_payload: Any = None
            if req_body:
                for _media_obj in req_body.get("content", {}).values():
                    props = _media_obj.get("schema", {}).get("properties")
                    if props:
                        openapi_request_payload = props
                        break
            openapi_response_payload = {str(sc): ro for sc, ro in responses.items()}

            docs.append(
                Document(
                    page_content="\n".join(content_parts),
                    metadata={
                        "source": title,
                        "endpoint": path_str,
                        "method": method.upper(),
                        "type": "openapi",
                        "body_fields": openapi_body_fields,
                        "headers": openapi_headers,
                        "request_payload": openapi_request_payload,
                        "response_payload": openapi_response_payload,
                    },
                )
            )
    logger.info("Parsed %d operations from OpenAPI spec '%s'", len(docs), title)
    return docs


# ---------------------------------------------------------------------------
# Generic document parsers
# ---------------------------------------------------------------------------

def parse_pdf(path: Path) -> list[Document]:
    from langchain_community.document_loaders import PyPDFLoader
    loader = PyPDFLoader(str(path))
    docs = loader.load()
    for doc in docs:
        doc.metadata["type"] = "pdf"
    return docs


def parse_docx(path: Path) -> list[Document]:
    from langchain_community.document_loaders import Docx2txtLoader
    loader = Docx2txtLoader(str(path))
    docs = loader.load()
    for doc in docs:
        doc.metadata["type"] = "docx"
    return docs


def parse_text(path: Path) -> list[Document]:
    content = path.read_text(encoding="utf-8")
    return [Document(page_content=content, metadata={"source": path.name, "type": "text"})]


# ---------------------------------------------------------------------------
# Unified entry point
# ---------------------------------------------------------------------------

PARSERS = {
    ".json": lambda p: (
        parse_postman_collection(p)
        if _looks_like_postman(p)
        else parse_openapi_spec(p)
    ),
    ".yaml": parse_openapi_spec,
    ".yml": parse_openapi_spec,
    ".pdf": parse_pdf,
    ".docx": parse_docx,
    ".txt": parse_text,
    ".md": parse_text,
}


def _looks_like_postman(path: Path) -> bool:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return "info" in data and "_postman_id" in data.get("info", {})
    except Exception:
        return False


def build_api_metadata_map(raw_docs: list[Document]) -> dict[str, Any]:
    """
    Build a structured map of {api_name: {name, url, method, headers, request_payload, response_payload}}
    from parsed raw documents (Postman / OpenAPI only).

    Variable placeholders such as {{var}} in URLs, headers, and payloads are preserved as-is.
    """
    result: dict[str, Any] = {}
    for doc in raw_docs:
        m = doc.metadata
        if m.get("type") not in ("postman", "openapi"):
            continue
        name = m.get("endpoint") or m.get("source", "")
        if not name:
            continue
        result[name] = {
            "name":             name,
            "url":              m.get("url", ""),
            "method":           m.get("method", ""),
            "headers":          m.get("headers", {}),
            "request_payload":  m.get("request_payload"),
            "response_payload": m.get("response_payload", {}),
        }
    return result


def ingest_file(file_path: str) -> tuple[list[Document], list[Document]]:
    """
    Parse and index a file.

    Returns
    -------
    raw_docs : list[Document]
        One document per logical unit (one per endpoint for Postman/OpenAPI,
        one per page for PDF, etc.).  Used for endpoint-batch LLM generation.
    chunks : list[Document]
        raw_docs split into overlapping chunks for FAISS indexing.
    """
    path = Path(file_path)
    suffix = path.suffix.lower()
    parser = PARSERS.get(suffix)
    logger.info("Ingesting file '%s' with parser for suffix '%s'", path.name, suffix)
    if parser is None:
        raise ValueError(f"Unsupported file type: {suffix}")

    raw_docs = parser(path)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )
    chunks = splitter.split_documents(raw_docs)
    logger.info("Produced %d chunks from '%s'", len(chunks), path.name)
    return raw_docs, chunks
