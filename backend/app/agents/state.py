from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langgraph.graph.message import add_messages


class TestCopilotState(TypedDict):
    # Core conversation
    messages: Annotated[list, add_messages]

    # Session context
    session_id: str
    thread_id: str

    # Uploaded file details
    uploaded_file_path: str | None
    file_type: str | None  # postman | openapi | pdf | docx | text

    # RAG context string assembled before generation
    rag_context: str

    # Parsed endpoints summary (used for structured generation)
    endpoints_summary: list[dict[str, Any]]

    # Structured API metadata map: {api_name: {url, method, headers, request_payload, response_payload}}
    api_metadata_map: dict[str, Any]

    # LLM-summarized Jira + context docs (empty string when none provided)
    context_summary: str

    # Generated manual test cases (list of TestCase-like dicts)
    manual_test_cases: list[dict[str, Any]]
    test_suite_title: str

    # Human-in-the-loop
    human_approved: bool
    human_feedback: str | None
    review_iteration: int  # how many improve cycles have run

    # Test data
    test_data_file_path: str | None
    test_data: list[dict[str, Any]]  # parsed rows

    # Automation
    generated_test_file: str | None  # path to generated pytest file

    # Load test scripts (multiple per session)
    load_tests: list[dict[str, Any]]  # [{id, name, endpoints, file_path, vus, duration, ...}]

    # Execution
    execution_status: str | None  # running | passed | failed | error
    execution_log: list[str]
    allure_report_url: str | None

    # Intake questionnaire (collected after indexing, before generation)
    questionnaire_answers: dict[str, Any]
    # LLM-generated targeted questions (replaces the static 14-question form)
    questionnaire_questions: list[dict[str, Any]]

    # Flow control
    current_step: str
    error_message: str | None
