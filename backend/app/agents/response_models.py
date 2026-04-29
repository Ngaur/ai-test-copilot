"""
Pydantic response models for all LLM structured outputs in the APITests.ai workflow.

Each model maps to a specific generation node:
  - TestCaseListOutput   → generate_test_cases, improve_test_cases, workflow generation
  - TestDataSchemaOutput → test data schema suggestion (_suggest_test_data_schema)

Using these models with `llm.with_structured_output()` guarantees that every LLM
call returns a deterministic, type-safe structure — no ad-hoc JSON parsing required.
"""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class TestCaseType(str, Enum):
    FUNCTIONAL = "Functional"
    NEGATIVE = "Negative"
    EDGE_CASE = "Edge Case"
    SECURITY = "Security"
    PERFORMANCE = "Performance"


class TestCasePriority(str, Enum):
    P1_CRITICAL = "P1-Critical"
    P2_HIGH = "P2-High"
    P3_MEDIUM = "P3-Medium"
    P4_LOW = "P4-Low"


class HttpMethod(str, Enum):
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"


# ---------------------------------------------------------------------------
# Test Case models
# ---------------------------------------------------------------------------

class TestStepOutput(BaseModel):
    step_number: int = Field(description="Sequential step number starting at 1")
    action: str = Field(description="Exact action: HTTP method + path + request payload summary")
    expected_result: str = Field(
        description="Specific outcome: status code + full response body field assertions"
    )


class TestCaseOutput(BaseModel):
    id: str = Field(default="", description="Test case ID, e.g. TC-001")
    title: str = Field(description="Short action-oriented title describing what is being tested")
    module: str = Field(description="API resource name, e.g. User Management, Authentication")
    test_type: TestCaseType = Field(
        description="Category: Functional, Negative, Edge Case, Security, or Performance"
    )
    priority: TestCasePriority = Field(
        description="Priority level: P1-Critical, P2-High, P3-Medium, or P4-Low"
    )
    endpoint: str = Field(
        default="",
        description="HTTP method + path, e.g. POST /api/users",
    )
    http_method: HttpMethod = Field(
        default=HttpMethod.GET,
        description="HTTP method: GET, POST, PUT, PATCH, or DELETE",
    )
    preconditions: list[str] = Field(
        default_factory=list,
        description="Setup conditions required before executing the test",
    )
    steps: list[TestStepOutput] = Field(
        default_factory=list,
        description="Ordered list of test execution steps",
    )
    expected_result: str = Field(
        description="Overall expected outcome: status code + all response body field assertions"
    )
    postconditions: list[str] = Field(
        default_factory=list,
        description="Cleanup steps if test mutated system state",
    )
    test_data_hints: list[str] = Field(
        default_factory=list,
        description="Field descriptions for required test data values, e.g. 'email: valid email format'",
    )
    notes: str = Field(
        default="",
        description="Rationale, related error code, or field being boundary-tested",
    )


class TestCaseListOutput(BaseModel):
    """Structured output wrapper for any node that generates a list of test cases."""

    test_cases: list[TestCaseOutput] = Field(
        description="Complete list of generated or updated test cases"
    )


# ---------------------------------------------------------------------------
# Test Data Schema models
# ---------------------------------------------------------------------------

class TestDataColumn(BaseModel):
    name: str = Field(description="Column name in snake_case")
    type: str = Field(description="Data type of the column, e.g. string, integer, boolean")
    example: str = Field(default="", description="Representative example value for this column")
    required: bool = Field(
        default=False,
        description="True if this column is required for happy-path positive tests",
    )


class TestDataSchemaOutput(BaseModel):
    """Structured output wrapper for the test data schema suggestion node."""

    columns: list[TestDataColumn] = Field(
        description="List of test data columns needed for automation, one per input variable"
    )


# ---------------------------------------------------------------------------
# AI-generated test data models
# ---------------------------------------------------------------------------

class TestDataField(BaseModel):
    """A single field inside a generated test data row."""
    key: str = Field(description="Field name (matches the API parameter / body field name)")
    value: str = Field(description="Realistic string value for this field")


class TestDataRow(BaseModel):
    """A single row of AI-generated test data as an explicit list of key-value pairs."""
    fields: list[TestDataField] = Field(
        description="All field-value pairs for this test scenario, in the same order as column_names"
    )


class GeneratedTestDataOutput(BaseModel):
    """LLM structured output for test data generation from the API spec."""
    column_names: list[str] = Field(
        description="Ordered list of all field/column names present in every row"
    )
    rows: list[TestDataRow] = Field(
        description="List of test data rows; each row is a complete, independent test scenario"
    )


# ---------------------------------------------------------------------------
# Dynamic questionnaire models
# ---------------------------------------------------------------------------

class QuestionnaireQuestion(BaseModel):
    id: str = Field(description="Unique question identifier, e.g. 'q1'")
    question: str = Field(description="The question text shown to the user")
    type: str = Field(description="Input type: text | textarea | select | multi_select")
    options: list[str] = Field(
        default_factory=list,
        description="Answer options for select / multi_select types; empty for text/textarea",
    )
    hint: str = Field(default="", description="One-line hint explaining why this question improves test quality")
    category: str = Field(
        default="",
        description="Semantic category: error_codes | auth | business_rules | workflow | pii | test_preferences",
    )


class QuestionnaireQuestionsOutput(BaseModel):
    """Structured output for the dynamic questionnaire generation node."""
    questions: list[QuestionnaireQuestion] = Field(
        description="Targeted clarifying questions (5-8 max) based on gaps identified in the API spec"
    )
