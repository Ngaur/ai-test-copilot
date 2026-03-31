"""
LangGraph node functions for the AI Test Copilot workflow.

Flow:
  ingest_and_index
      → generate_test_cases
          → [INTERRUPT: human_review]
              → should_improve? → improve_test_cases → [INTERRUPT: human_review]  (loop)
              → approved?       → request_test_data
                                    → [INTERRUPT: await_test_data]
                                        → generate_automated_tests
                                            → execute_tests
                                                → END
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path as _PathLib
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agents.prompts import (
    CONTEXT_SUMMARY_PROMPT,
    GENERATE_FEATURE_SCENARIO_PROMPT,
    GENERATE_PLAYWRIGHT_MODULE_PROMPT,
    GENERATE_TESTS_BATCH_PROMPT,
    GENERATE_TESTS_PROMPT,
    GENERATE_WORKFLOW_PROMPT,
    IMPROVE_TESTS_PROMPT,
    SYSTEM_PROMPT,
    TEST_DATA_SCHEMA_PROMPT,
)
from app.agents.response_models import (
    TestCaseListOutput,
    TestDataColumn,
    TestDataSchemaOutput,
)
from app.agents.state import TestCopilotState
from app.rag import vector_store as vs
from app.rag.ingestor import build_api_metadata_map, ingest_file
from app.services.llm_service import get_llm

logger = logging.getLogger("ai_test_copilot.nodes")


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _assemble_rag_context(session_id: str, query: str) -> str:
    try:
        docs = vs.similarity_search(session_id, query)
        return "\n\n---\n\n".join(d.page_content for d in docs)
    except Exception as exc:
        logger.warning("RAG retrieval failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# Node: ingest_and_index
# ---------------------------------------------------------------------------

def ingest_and_index(state: TestCopilotState) -> dict[str, Any]:
    """Parse uploaded spec + any context docs and index into FAISS."""
    from app.core.config import settings as _settings

    file_path = state["uploaded_file_path"]
    session_id = state["session_id"]

    if not file_path:
        return {
            "current_step": "error",
            "error_message": "No file uploaded. Please upload a Postman collection or API spec first.",
            "messages": [AIMessage(content="No file uploaded. Please upload a Postman collection or API spec first.")],
        }

    try:
        raw_docs, chunks = ingest_file(file_path)

        # Also ingest any supplementary context documents uploaded to uploads/{session_id}/context/
        context_dir = _PathLib(_settings.upload_dir) / session_id / "context"
        context_doc_names: list[str] = []
        if context_dir.exists():
            for ctx_file in sorted(context_dir.iterdir()):
                if not ctx_file.is_file():
                    continue
                try:
                    _, ctx_chunks = ingest_file(str(ctx_file))
                    # Tag every chunk so prompts know it's business context, not spec
                    for doc in ctx_chunks:
                        doc.metadata["source_type"] = "context"
                        doc.metadata["context_filename"] = ctx_file.name
                    chunks.extend(ctx_chunks)
                    context_doc_names.append(ctx_file.name)
                    logger.info("Ingested context doc '%s' for session '%s'", ctx_file.name, session_id)
                except Exception as ctx_exc:
                    logger.warning("Failed to ingest context doc '%s': %s", ctx_file.name, ctx_exc)

        vs.add_documents(session_id, chunks)

        # Build endpoint summary for structured files (Postman / OpenAPI).
        # PDF/DOCX/text docs have no "endpoint" metadata → filtered out → empty list → fallback mode.
        endpoints_summary = [
            {
                "endpoint":   d.metadata.get("endpoint", ""),
                "method":     d.metadata.get("method", ""),
                "url":        d.metadata.get("url", ""),
                "source":     d.metadata.get("source", ""),
                "content":    d.page_content,
                "body_fields": d.metadata.get("body_fields", []),
            }
            for d in raw_docs
            if d.metadata.get("endpoint")
        ]

        # Build structured API metadata map: {api_name: {url, method, headers, request_payload, response_payload}}
        api_metadata_map = build_api_metadata_map(raw_docs)
        logger.info("Built api_metadata_map with %d entries for session '%s'", len(api_metadata_map), session_id)

        # Summarize context/Jira docs with a single focused LLM call so the summary
        # can be injected directly into generation prompts (complementing RAG retrieval).
        context_summary = ""
        if context_doc_names:
            ctx_texts: list[str] = []
            for ctx_file in sorted(context_dir.iterdir()):
                if ctx_file.is_file():
                    try:
                        ctx_texts.append(ctx_file.read_text(encoding="utf-8", errors="ignore")[:3000])
                    except Exception:
                        pass
            raw_ctx = "\n\n---\n\n".join(ctx_texts)[:12000]
            try:
                summary_resp = get_llm().invoke(
                    [HumanMessage(content=CONTEXT_SUMMARY_PROMPT.format(context=raw_ctx))]
                )
                context_summary = summary_resp.content.strip()
                logger.info("Context summary generated (%d chars) for session '%s'", len(context_summary), session_id)
            except Exception as exc:
                logger.warning("Context summarization failed for session '%s': %s", session_id, exc)

        ep_info = f"across **{len(endpoints_summary)} endpoints**" if endpoints_summary else f"as **{len(chunks)} chunks**"
        ctx_info = (
            f" + **{len(context_doc_names)} context doc(s)** ({', '.join(context_doc_names)})"
            if context_doc_names else ""
        )

        # For structured specs (Postman / OpenAPI) suggest the test data schema upfront
        # so the user can optionally upload a data file BEFORE test case generation.
        if endpoints_summary:
            try:
                schema_suggestion = _suggest_test_data_schema([], endpoints_summary)
            except Exception as _exc:
                logger.warning("Early schema suggestion failed for session '%s': %s", session_id, _exc)
                schema_suggestion = None

            # Only show the early-upload window if the schema has at least one column row
            if schema_suggestion and "| `" in schema_suggestion:
                msg = (
                    f"Indexed **{len(chunks)} chunks** from your spec ({ep_info}){ctx_info}.\n\n"
                    "**Optional: Upload test data before generating test cases**\n\n"
                    "If you have test data ready, uploading it now will generate richer test cases "
                    "with real values in assertions (instead of placeholders).\n\n"
                    "Based on your API spec, here's the suggested schema for your test data file:\n\n"
                    f"{schema_suggestion}\n\n"
                    "**Supported formats:** CSV · Excel (.xlsx) · JSON array — upload via the 📎 button.\n\n"
                    "Or click **Proceed** to skip and start test case generation now."
                )
                next_step = "awaiting_test_data_or_generate"
            else:
                msg = (
                    f"Indexed **{len(chunks)} chunks** from your spec ({ep_info}){ctx_info}. "
                    "Now generating comprehensive test cases — this may take a moment..."
                )
                next_step = "generating"
        else:
            msg = (
                f"Indexed **{len(chunks)} chunks** from your spec ({ep_info}){ctx_info}. "
                "Now generating comprehensive test cases — this may take a moment..."
            )
            next_step = "generating"

        return {
            "current_step": next_step,
            "endpoints_summary": endpoints_summary,
            "api_metadata_map": api_metadata_map,
            "context_summary": context_summary,
            "messages": [AIMessage(content=msg)],
        }
    except Exception as exc:
        logger.exception("Ingestion failed")
        return {
            "current_step": "error",
            "error_message": str(exc),
            "messages": [AIMessage(content=f"Failed to parse the uploaded file: {exc}")],
        }


# ---------------------------------------------------------------------------
# Helpers: JSON parsing + per-mode generation
# ---------------------------------------------------------------------------

def _parse_llm_json(raw: str) -> list:
    """Extract a JSON array from raw LLM output, tolerating markdown fences."""
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("["), raw.rfind("]") + 1
        if start != -1 and end > start:
            return json.loads(raw[start:end])
        return []


def _batch_generate_test_cases(
    endpoints_summary: list[dict],
    llm,
    api_metadata_map: dict = None,
    context_summary: str = "",
    test_data: list[dict] = None,
) -> list[dict]:
    """
    Generate test cases in endpoint-sized batches so every endpoint is covered,
    regardless of collection size.  Avoids the FAISS top-k cutoff problem.
    """
    from app.core.config import settings
    batch_size = settings.endpoint_batch_size
    batches = [endpoints_summary[i:i + batch_size] for i in range(0, len(endpoints_summary), batch_size)]
    all_cases: list[dict] = []
    id_counter = 1

    for idx, batch in enumerate(batches, start=1):
        endpoint_list = ", ".join(f"{ep['method']} {ep['endpoint']}" for ep in batch)
        logger.info("Generating batch %d/%d — endpoints: %s", idx, len(batches), endpoint_list)
        context = "\n\n---\n\n".join(ep["content"] for ep in batch)

        # Build compact metadata section for only the endpoints in this batch
        batch_metadata: dict = {}
        if api_metadata_map:
            for ep in batch:
                ep_name = ep.get("endpoint", "")
                if ep_name in api_metadata_map:
                    batch_metadata[ep_name] = api_metadata_map[ep_name]
        api_metadata_json = json.dumps(batch_metadata, indent=2) if batch_metadata else "(not available)"

        test_data_json = json.dumps(test_data, indent=2) if test_data else "(none)"
        structured_llm = llm.with_structured_output(TestCaseListOutput)
        prompt = GENERATE_TESTS_BATCH_PROMPT.format(
            endpoint_list=endpoint_list,
            rag_context=context,
            api_metadata=api_metadata_json,
            context_summary=context_summary or "(none provided)",
            test_data=test_data_json,
        )
        result: TestCaseListOutput = structured_llm.invoke(
            [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]
        )
        batch_cases = [tc.model_dump() for tc in result.test_cases]
        for tc in batch_cases:
            tc["id"] = f"TC-{id_counter:03d}"
            id_counter += 1
        all_cases.extend(batch_cases)
        logger.info("Batch %d/%d → %d cases (running total: %d)", idx, len(batches), len(batch_cases), len(all_cases))

    return all_cases


def _single_generate_test_cases(rag_context: str, llm) -> list[dict]:
    """Fallback single-call generation for unstructured docs (PDF, DOCX, text)."""
    prompt = GENERATE_TESTS_PROMPT.format(rag_context=rag_context)
    structured_llm = llm.with_structured_output(TestCaseListOutput)
    result: TestCaseListOutput = structured_llm.invoke(
        [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]
    )
    return [tc.model_dump() for tc in result.test_cases]


def _generate_workflow_test_cases(
    endpoints_summary: list[dict],
    llm,
    start_id: int,
    context_summary: str = "",
    test_data: list[dict] = None,
) -> list[dict]:
    """
    Generate cross-API end-to-end workflow test cases after per-endpoint batch generation.
    Uses a compact endpoint list so it fits in Ollama's context window.
    Skipped for collections with fewer than 2 endpoints.
    """
    if len(endpoints_summary) < 2:
        return []

    # Number of workflow scenarios scales with collection size
    n_workflows = min(6, max(3, len(endpoints_summary) // 4))

    # Compact endpoint list for the full collection
    endpoint_list = "\n".join(
        f"- {ep['method']} {ep['endpoint']}" for ep in endpoints_summary
    )

    # Sample a few endpoints' full content to ground the LLM on actual payloads/schemas
    sample_size = min(4, len(endpoints_summary))
    context_sample = "\n\n---\n\n".join(ep["content"] for ep in endpoints_summary[:sample_size])

    logger.info("Generating %d workflow test cases across %d endpoints", n_workflows, len(endpoints_summary))
    test_data_json = json.dumps(test_data, indent=2) if test_data else "(none)"
    prompt = GENERATE_WORKFLOW_PROMPT.format(
        endpoint_list=endpoint_list,
        context_sample=context_sample,
        n_workflows=n_workflows,
        context_summary=context_summary or "(none provided)",
        test_data=test_data_json,
    )
    structured_llm = llm.with_structured_output(TestCaseListOutput)
    result: TestCaseListOutput = structured_llm.invoke(
        [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]
    )
    workflow_cases = [tc.model_dump() for tc in result.test_cases]

    for tc in workflow_cases:
        tc["id"] = f"TC-{start_id:03d}"
        start_id += 1

    logger.info("Workflow generation produced %d test cases", len(workflow_cases))
    return workflow_cases


# ---------------------------------------------------------------------------
# Node: generate_test_cases
# ---------------------------------------------------------------------------

def generate_test_cases(state: TestCopilotState) -> dict[str, Any]:
    """
    Generate initial manual test cases.

    - Structured files (Postman / OpenAPI): batch mode — one LLM call per N endpoints,
      guaranteeing every endpoint is covered regardless of collection size.
    - Unstructured files (PDF / DOCX / text): fallback to broad-query RAG (original behaviour).
    """
    session_id = state["session_id"]
    endpoints_summary = state.get("endpoints_summary", [])
    llm = get_llm()

    if endpoints_summary:
        from app.core.config import settings as _s
        n_batches = -(-len(endpoints_summary) // _s.endpoint_batch_size)
        logger.info("Batch generation mode: %d endpoints → %d batches", len(endpoints_summary), n_batches)
        api_metadata_map = state.get("api_metadata_map", {})
        context_summary = state.get("context_summary", "")
        test_data: list[dict] = state.get("test_data", [])
        if test_data:
            logger.info("Early test data available (%d rows) — injecting into test case generation", len(test_data))
        test_cases = _batch_generate_test_cases(
            endpoints_summary, llm,
            api_metadata_map=api_metadata_map,
            context_summary=context_summary,
            test_data=test_data or None,
        )

        # Second pass: cross-API workflow / E2E test cases
        workflow_cases = _generate_workflow_test_cases(
            endpoints_summary, llm,
            start_id=len(test_cases) + 1,
            context_summary=context_summary,
            test_data=test_data or None,
        )
        test_cases.extend(workflow_cases)

        rag_context = _assemble_rag_context(session_id, "API endpoints request response authentication authorization")
    else:
        rag_context = _assemble_rag_context(session_id, "API endpoints request response authentication authorization")
        if not rag_context:
            return {
                "current_step": "awaiting_review",
                "messages": [AIMessage(content=(
                    "I couldn't retrieve enough context from the uploaded file to generate quality tests. "
                    "Could you provide more detail — for example a JIRA story or additional documentation?"
                ))],
            }
        test_cases = _single_generate_test_cases(rag_context, llm)

    tc_count = len(test_cases)
    summary_lines = [
        f"**{tc['id']}** — {tc['title']} ({tc['test_type']}, {tc['priority']})"
        for tc in test_cases[:5]
    ]
    if tc_count > 5:
        summary_lines.append(f"...and {tc_count - 5} more")

    workflow_count = sum(1 for tc in test_cases if tc.get("module") == "E2E Workflow")
    msg = (
        f"Generated **{tc_count} test cases**"
        + (f" across **{len(endpoints_summary)} endpoints**" if endpoints_summary else "")
        + (f" (including **{workflow_count} end-to-end workflow scenarios**)" if workflow_count else "")
        + ". Here's a preview:\n\n"
        + "\n".join(f"- {line}" for line in summary_lines)
        + "\n\nPlease review the full test suite in the panel on the right. "
        "You can **approve** them or provide **feedback** to improve specific cases."
    )

    return {
        "manual_test_cases": test_cases,
        "rag_context": rag_context,
        "current_step": "awaiting_review",
        "messages": [AIMessage(content=msg)],
    }


# ---------------------------------------------------------------------------
# Node: human_review  (interrupt point — no logic, just sets status)
# ---------------------------------------------------------------------------

def human_review(state: TestCopilotState) -> dict[str, Any]:
    # If feedback is pending (not yet processed), keep status as "improving"
    # so the frontend polling sees a stable "improving" state while the LLM works.
    # Once improve_test_cases runs it clears human_feedback and sets "awaiting_review".
    if state.get("human_feedback") and not state.get("human_approved"):
        return {"current_step": "improving"}
    return {"current_step": "awaiting_review"}


# ---------------------------------------------------------------------------
# Node: improve_test_cases
# ---------------------------------------------------------------------------

def improve_test_cases(state: TestCopilotState) -> dict[str, Any]:
    """Incorporate human feedback and regenerate / augment test cases."""
    feedback = state.get("human_feedback", "")
    existing = json.dumps(state.get("manual_test_cases", []), indent=2)
    session_id = state["session_id"]
    rag_context = _assemble_rag_context(session_id, feedback or "test cases improvement")

    llm = get_llm()
    prompt = IMPROVE_TESTS_PROMPT.format(
        existing_test_cases=existing,
        feedback=feedback,
        rag_context=rag_context,
    )
    structured_llm = llm.with_structured_output(TestCaseListOutput)
    result: TestCaseListOutput = structured_llm.invoke(
        [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]
    )
    updated_cases = [tc.model_dump() for tc in result.test_cases] or state["manual_test_cases"]

    iteration = state.get("review_iteration", 0) + 1
    msg = (
        f"Updated test suite (iteration {iteration}). "
        f"Now contains **{len(updated_cases)} test cases**. "
        "Please review again and approve or provide further feedback."
    )

    return {
        "manual_test_cases": updated_cases,
        "review_iteration": iteration,
        "human_feedback": None,
        "current_step": "awaiting_review",
        "messages": [AIMessage(content=msg)],
    }


# ---------------------------------------------------------------------------
# Node: request_test_data
# ---------------------------------------------------------------------------

def _suggest_test_data_schema(test_cases: list[dict], endpoints_summary: list[dict] | None = None) -> str:
    """
    Derive the test data schema by calling the LLM once per endpoint group.

    Strategy:
      - Group test cases by their endpoint (e.g. "POST /api/users")
      - For each group, build a small, focused prompt containing only that
        endpoint's test cases and its body field list from the spec
      - Call LLM once per endpoint; parse the returned column JSON array
      - Merge columns across all endpoints (first-seen wins for duplicates)
      - `test_case_id` is always the first column regardless of LLM output

    This keeps every LLM call small and focused, producing better schema
    suggestions than passing the entire test suite at once.
    """
    import re

    llm = get_llm()

    # Build a lookup: "METHOD /path" -> body_fields from Postman/OpenAPI spec
    ep_body_lookup: dict[str, list[str]] = {}
    for ep_info in (endpoints_summary or []):
        method = ep_info.get("method", "").upper()
        path = ep_info.get("endpoint", "") or ep_info.get("url", "")
        key = f"{method} {path}".strip()
        if key and ep_info.get("body_fields"):
            ep_body_lookup[key] = ep_info["body_fields"]

    # Group test cases by endpoint
    endpoint_groups: dict[str, list[dict]] = {}
    for tc in test_cases:
        ep = tc.get("endpoint", "UNKNOWN")
        endpoint_groups.setdefault(ep, []).append(tc)

    # Accumulate columns: name -> TestDataColumn (insertion order = merge order)
    # Note: test_case_id is intentionally excluded — users provide plain rows of field values;
    # the automation layer decides which rows apply to positive vs negative test cases.
    merged: dict[str, TestDataColumn] = {}
    structured_llm = llm.with_structured_output(TestDataSchemaOutput)

    for endpoint, tcs in endpoint_groups.items():
        body_fields = ep_body_lookup.get(endpoint, [])
        prompt = TEST_DATA_SCHEMA_PROMPT.format(
            endpoint=endpoint,
            body_fields=json.dumps(body_fields),
            test_cases=json.dumps(tcs, indent=2),
        )
        try:
            result = structured_llm.invoke(
                [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]
            )
            for col in result.columns:  # type: ignore[union-attr]
                if col.name and col.name not in merged:
                    merged[col.name] = col
        except Exception as exc:
            logger.warning("Schema LLM call failed for %s: %s", endpoint, exc)

    # Deterministic fallback when LLM produced nothing
    if len(merged) == 0:
        logger.warning("LLM schema calls produced no columns; falling back to deterministic extraction")
        seen_p: set[str] = set()
        for tc in test_cases:
            for param in re.findall(r"\{(\w+)\}", tc.get("endpoint", "")):
                if param not in seen_p:
                    seen_p.add(param)
                    merged[param] = TestDataColumn(
                        name=param, type="string/integer", example="example-id", required=True
                    )
        for ep_info in (endpoints_summary or []):
            if ep_info.get("method", "").upper() in {"POST", "PUT", "PATCH"}:
                for field in ep_info.get("body_fields", []):
                    if field not in merged:
                        merged[field] = TestDataColumn(
                            name=field, type="string", example=f"{field}_value", required=False
                        )

    # Build markdown table + sample JSON from merged columns
    header    = "| Column | Type | Example | Required |"
    separator = "|--------|------|---------|----------|"
    rows:   list[str] = []
    sample: dict[str, str] = {}
    for name, col in merged.items():
        req = "Yes" if col.required else "No"
        ex  = col.example
        rows.append(f"| `{name}` | {col.type} | {ex} | {req} |")
        sample[name] = ex

    table       = "\n".join([header, separator] + rows)
    sample_json = json.dumps(sample, indent=2)
    return f"{table}\n\n**Sample JSON row:**\n```json\n{sample_json}\n```"


def request_test_data(state: TestCopilotState) -> dict[str, Any]:
    # Second pass: test data has already been uploaded — skip schema generation and
    # signal the graph to proceed straight to automation generation.  This prevents
    # the node from briefly setting current_step="awaiting_test_data" during the
    # background generation task, which would cause frontend polling to stop early.
    if state.get("test_data"):
        return {"current_step": "generating_automation"}

    # First pass: no test data yet — generate the schema suggestion and ask for upload.
    test_cases = state.get("manual_test_cases", [])
    endpoints_summary = state.get("endpoints_summary", [])
    tc_count = len(test_cases)

    schema_suggestion = _suggest_test_data_schema(test_cases, endpoints_summary)

    msg = (
        f"Test suite approved! **{tc_count} test cases** are ready.\n\n"
        "To generate automated pytest tests, upload a **test data file** using the 📎 button below.\n\n"
        "Based on your test cases, here's the suggested schema for your file:\n\n"
        f"{schema_suggestion}\n\n"
        "**Supported formats:** CSV · Excel (.xlsx) · JSON array\n"
        "Each row = one test scenario. Column headers must match the names above."
    )
    return {
        "current_step": "awaiting_test_data",
        "human_approved": False,
        "messages": [AIMessage(content=msg)],
    }


# ---------------------------------------------------------------------------
# Node: generate_automated_tests  (no-op guard)
# ---------------------------------------------------------------------------

def generate_automated_tests(state: TestCopilotState) -> dict[str, Any]:
    """
    This node is intercepted by the background task in documents.py which uses
    generate_tests_progressively() to do per-TC generation with live progress updates.
    If the file already exists (set via g.update_state), this is a no-op pass-through.
    """
    if state.get("generated_test_file"):
        return {"current_step": "ready_to_execute"}
    # Shouldn't normally reach here, but handle gracefully.
    return {
        "current_step": "error",
        "error_message": "Automated test generation was not completed.",
        "messages": [AIMessage(content="Automated test generation failed. Please try again.")],
    }


# ---------------------------------------------------------------------------
# Progressive generation: one LLM call per test case with live progress updates
# ---------------------------------------------------------------------------

def _module_to_slug(module: str) -> str:
    """Convert a module name to a safe lowercase filename / Gherkin tag slug."""
    import re
    return re.sub(r"[^a-z0-9]+", "_", module.lower()).strip("_")


def generate_feature_files(g: Any, config: dict, state_values: dict) -> None:
    """
    Phase 1: Generate Gherkin .feature files — one per test case module — writing progress
    to graph state after each file so the frontend polling loop sees live updates.

    Called directly by the background task — NOT as a LangGraph node.
    When done, updates state with generated_test_file (first feature file path) +
    current_step: awaiting_playwright_confirmation, so the user can decide whether
    to continue with Playwright test generation.
    """
    import os
    from pathlib import Path

    from app.core.config import settings

    test_cases: list[dict] = state_values.get("manual_test_cases", [])
    api_metadata: dict = state_values.get("api_metadata_map", {})
    test_data: list[dict] = state_values.get("test_data", [])
    session_id: str = state_values.get("session_id", "unknown")

    llm = get_llm()
    total = len(test_cases)

    g.update_state(config, {
        "current_step": "generating_automation",
        "messages": [AIMessage(
            content=f"Generating Gherkin feature files for **{total} test cases**..."
        )],
    })

    # Group test cases by module — preserves insertion order (Python 3.7+)
    module_groups: dict[str, list[dict]] = {}
    for tc in test_cases:
        module = tc.get("module") or "General"
        module_groups.setdefault(module, []).append(tc)

    out_dir = os.path.join(settings.generated_tests_dir, session_id, "features")
    os.makedirs(out_dir, exist_ok=True)

    api_names_json    = json.dumps(list(api_metadata.keys()), indent=2)
    api_metadata_json = json.dumps(api_metadata, indent=2)

    feature_files: list[str] = []
    first_file: str = ""
    total_modules = len(module_groups)

    for idx, (module, cases) in enumerate(module_groups.items(), 1):
        slug = _module_to_slug(module)
        tag  = slug.upper()[:30]  # keep Gherkin tags short

        logger.info(
            "Generating feature file %d/%d for module '%s' (%d cases)",
            idx, total_modules, module, len(cases),
        )

        prompt = GENERATE_FEATURE_SCENARIO_PROMPT.format(
            feature_name=module,
            feature_tag=tag,
            api_names=api_names_json,
            api_metadata=api_metadata_json,
            test_data=json.dumps(test_data, indent=2) if test_data else "(none)",
            test_cases=json.dumps(cases, indent=2),
        )
        try:
            response = llm.invoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)])
            content = str(response.content).strip()
            # Strip markdown code fences if the LLM wrapped the output
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        except Exception as exc:
            logger.warning("Feature generation failed for module '%s': %s", module, exc)
            content = f"Feature: {module}\n\n  # GENERATION FAILED: {exc}\n"

        feature_file = os.path.join(out_dir, f"{slug}.feature")
        Path(feature_file).write_text(content, encoding="utf-8")
        feature_files.append(feature_file)
        if not first_file:
            first_file = feature_file

        g.update_state(config, {
            "current_step": "generating_automation",
            "messages": [AIMessage(
                content=f"**{idx}/{total_modules}** — Generated: *{module}* ({len(cases)} scenarios)"
            )],
        })

    logger.info(
        "Feature generation complete: %d file(s) → %s", len(feature_files), out_dir
    )

    file_list = "\n".join(f"- `{os.path.basename(f)}`" for f in feature_files)
    g.update_state(config, {
        "generated_test_file": first_file,   # feature file path (for display)
        "current_step": "awaiting_playwright_confirmation",
        "messages": [AIMessage(content=(
            f"Generated **{len(feature_files)} feature file(s)** covering **{total} scenarios**.\n\n"
            f"{file_list}\n\n"
            "Would you like to generate **Playwright Python tests** for automated execution?"
        ))],
    })


def generate_playwright_tests(g: Any, config: dict, state_values: dict) -> None:
    """
    Phase 2: Generate Playwright Python tests from the already-created feature files.

    Called directly by the background task — NOT as a LangGraph node.
    When done, updates state with generated_test_file (py file path) +
    current_step: ready_to_execute.
    """
    import os
    from pathlib import Path

    from app.core.config import settings

    test_cases: list[dict] = state_values.get("manual_test_cases", [])
    api_metadata: dict = state_values.get("api_metadata_map", {})
    test_data: list[dict] = state_values.get("test_data", [])
    session_id: str = state_values.get("session_id", "unknown")

    llm = get_llm()

    # Rebuild module_groups from test_cases (same grouping as Phase 1)
    module_groups: dict[str, list[dict]] = {}
    for tc in test_cases:
        module = tc.get("module") or "General"
        module_groups.setdefault(module, []).append(tc)

    total_modules = len(module_groups)
    api_metadata_json = json.dumps(api_metadata, indent=2)
    session_dir = os.path.join(settings.generated_tests_dir, session_id)
    columns = list(test_data[0].keys()) if test_data else []

    # Write conftest.py (fixed boilerplate)
    conftest_content = '''import os
import pytest
from playwright.sync_api import Playwright, APIRequestContext


@pytest.fixture(scope="session")
def base_url() -> str:
    return os.getenv("TEST_BASE_URL", "http://localhost:8080")


@pytest.fixture(scope="session")
def auth_token() -> str:
    return os.getenv("TEST_AUTH_TOKEN", "")


@pytest.fixture(scope="session")
def api_request_context(playwright: Playwright, base_url: str):
    context = playwright.request.new_context(base_url=base_url)
    yield context
    context.dispose()
'''
    _PathLib(os.path.join(session_dir, "conftest.py")).write_text(conftest_content, encoding="utf-8")

    # Generate per-module Playwright test functions (one LLM call per module)
    all_functions: list[str] = []
    for idx, (module, cases) in enumerate(module_groups.items(), 1):
        logger.info(
            "Generating Playwright tests %d/%d for module '%s'",
            idx, total_modules, module,
        )
        g.update_state(config, {
            "current_step": "generating_automation",
            "messages": [AIMessage(
                content=f"**{idx}/{total_modules}** — Playwright: *{module}*"
            )],
        })
        prompt = GENERATE_PLAYWRIGHT_MODULE_PROMPT.format(
            module_name=module,
            test_cases=json.dumps(cases, indent=2),
            columns=json.dumps(columns),
            api_metadata=api_metadata_json,
            test_data=json.dumps(test_data, indent=2) if test_data else "(none)",
        )
        try:
            resp = llm.invoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)])
            funcs = str(resp.content).strip()
            # Strip markdown fences if LLM wrapped output
            if funcs.startswith("```"):
                lines = funcs.split("\n")
                funcs = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
            all_functions.append(f"# ── {module} ──\n\n{funcs}")
        except Exception as exc:
            logger.warning("Playwright generation failed for module '%s': %s", module, exc)
            all_functions.append(f"# ── {module} ── (GENERATION FAILED: {exc})\n")

    # Write test_generated.py
    test_data_repr = json.dumps(test_data, indent=2) if test_data else "[]"
    header = (
        "import re\n"
        "import allure\n"
        "import pytest\n"
        "from playwright.sync_api import APIRequestContext\n\n"
        f"TEST_DATA = {test_data_repr}\n\n"
    )
    py_file = os.path.join(session_dir, "test_generated.py")
    _PathLib(py_file).write_text(header + "\n\n".join(all_functions), encoding="utf-8")

    logger.info("Playwright test suite written → %s", py_file)

    g.update_state(config, {
        "generated_test_file": py_file,
        "current_step": "ready_to_execute",
        "messages": [AIMessage(content=(
            "Playwright test suite generated. Switch to the **Playwright Tests** tab, "
            "then click **Run Tests**."
        ))],
    })


# Keep old name as an alias so any external callers don't break immediately
generate_tests_progressively = generate_feature_files


# ---------------------------------------------------------------------------
# Node: execute_tests
# ---------------------------------------------------------------------------

def execute_tests(state: TestCopilotState) -> dict[str, Any]:
    """Run pytest with Allure and stream output. Non-blocking — kicks off subprocess."""
    import subprocess

    from app.core.config import settings

    test_file = state.get("generated_test_file")
    if not test_file:
        return {
            "execution_status": "error",
            "messages": [AIMessage(content="No generated test file found. Please generate automated tests first.")],
        }

    allure_results = settings.allure_results_dir
    cmd = [
        "python", "-m", "pytest",
        test_file,
        "--alluredir", allure_results,
        "-p", "no:allure_pytest_bdd",  # suppress plugin conflict when allure-pytest-bdd is also installed
        "-v",
        "--tb=short",
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
        )
        stdout_lines = result.stdout.splitlines()
        stderr_lines = result.stderr.splitlines()
        log_lines = stdout_lines + (stderr_lines if result.returncode != 0 else [])

        status = "passed" if result.returncode == 0 else "failed"
        msg = (
            f"Test execution **{status}**.\n\n"
            "The Allure report has been generated. Click **View Report** to open it.\n\n"
            f"```\n{result.stdout[-2000:]}\n```"
        )

        return {
            "execution_status": status,
            "execution_log": log_lines,
            "allure_report_url": "/api/v1/report/view",
            "current_step": "done",
            "messages": [AIMessage(content=msg)],
        }
    except subprocess.TimeoutExpired:
        return {
            "execution_status": "error",
            "messages": [AIMessage(content="Test execution timed out after 5 minutes.")],
        }


# ---------------------------------------------------------------------------
# Conditional edge functions
# ---------------------------------------------------------------------------

def should_improve_or_proceed(state: TestCopilotState) -> str:
    """
    After human_review interrupt resumes:
      - If approved=True  → go to request_test_data
      - If approved=False → go to improve_test_cases
    """
    if state.get("human_approved"):
        return "approved"
    return "needs_improvement"


def has_test_data(state: TestCopilotState) -> str:
    """After await_test_data interrupt resumes."""
    if state.get("test_data"):
        return "has_data"
    return "waiting"
