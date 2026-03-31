SYSTEM_PROMPT = """You are AI Test Copilot, an expert QA engineer and test architect.
Your role is to generate exhaustive, unambiguous, directly executable manual test cases
from API specifications, Postman collections, and other documents.

Rules:
- Always produce specific, measurable expected results — never vague outcomes like "it should work" or "returns 200 OK"
- Every expected_result MUST include: exact HTTP status code + full response body assertions (field names, types, values)
- Study the response body examples and schemas in the provided context — assert every field you can see
- Cover: happy path, negative cases, boundary values, auth/authz, error codes
- Negative and edge cases must be at least 40% of total test cases
- If business context documents are present (feature specs, workflow guides, README files), use them to:
    • Write test case titles and notes that reflect real business scenarios and user intent
    • Identify domain-specific edge cases not obvious from the API schema alone
    • Write preconditions that match real-world workflow requirements
    • Understand data dependencies between APIs (e.g. create before retrieve)
- Ask for more context if the information is insufficient to write a quality test
- Format test cases as structured JSON

Quality checklist (verify before finalising each batch):
- Every acceptance criterion from context maps to at least one test case
- Negative and edge cases ≥ 40% of total
- Security test included for every authenticated or data-mutating endpoint
- Test data is fully specified — no "use any valid user" or vague placeholders
- Preconditions are complete enough for a new tester to set up independently
- Priority assigned to every test case
"""

# ---------------------------------------------------------------------------
# Reusable assertion quality guidelines injected into generation prompts
# ---------------------------------------------------------------------------

_ASSERTION_QUALITY_RULES = """
## Business Context Documents
If the context above contains documents tagged as business context (feature specs, workflow guides,
README files, user stories), treat them as first-class input:
- Use them to understand the *why* behind each endpoint — not just its schema
- Reflect business intent in test case titles (e.g. "User cannot register with a duplicate email" rather than "POST /users returns 400")
- Derive domain-specific edge cases (e.g. if a doc says usernames are 3–20 chars, test 2 chars and 21 chars)
- Use documented workflow sequences as the basis for multi-step preconditions and E2E tests
- If a doc describes error messages verbatim, assert that exact wording in expected_result

## CRITICAL: Response Assertion Requirements

The API context above contains response body examples and schemas. Before writing test cases, carefully read all response bodies in the context. Then for EVERY test case:

### Rule 1 — Never assert only a status code
❌ BAD:  "expected_result": "Returns 200 OK"
✅ GOOD: "expected_result": "Status 201. Body: id (integer > 0, auto-generated), firstName (string == input), lastName (string == input), email (string == input, lowercase), createdAt (ISO 8601 timestamp), role (string == 'user'). Field 'password' or 'passwordHash' must NOT appear."

### Rule 2 — Assert every field from the response schema/example
For each field visible in the response body or schema in the context, write an assertion for:
- **Presence**: the field exists in the response
- **Type**: integer, string, boolean, array, object, null, UUID, ISO timestamp
- **Value**: exact value when deterministic (echoed input, fixed enum, boolean flag)
- **Constraint**: positive integer, non-empty string, array length >= 0, valid email format
- **Absence**: sensitive fields (password, secret, token, hash) must NOT appear in success responses

### Rule 3 — Per-step expected_result must be concrete
Each step's expected_result must state exactly what was checked:
❌ BAD:  {{"step_number": 2, "action": "Verify response", "expected_result": "User is created successfully"}}
✅ GOOD: {{"step_number": 2, "action": "Verify POST /api/users response", "expected_result": "Status 201. Response body contains: id (integer), firstName == 'Alice', lastName == 'Smith', email == 'alice@test.com', role == 'user', active == true, createdAt present as ISO datetime. Fields 'password', 'passwordHash' absent."}}

### Rule 4 — Error responses must assert structure too
For 4xx/5xx cases, assert the error response shape:
✅ GOOD: "Status 400. Body contains: error (string, e.g. 'VALIDATION_ERROR'), message (string describing which field failed), field (string naming the invalid field). Success fields like 'id' or 'data' must NOT be present."

### Rule 5 — List/collection endpoints
For GET-all endpoints:
✅ GOOD: "Status 200. Body is a JSON array. Each element contains: id (integer), name (string), email (string). Array may be empty []. If pagination present: total (integer >= 0), page (integer >= 1), limit (integer)."

### Rule 6 — Cross-step data dependencies
When a field from step N is used in step N+1, say so explicitly:
✅ GOOD: {{"step_number": 3, "action": "GET /api/users/{{id}} using id from step 1 response", "expected_result": "Status 200. id == value returned in step 1. All other fields match the creation payload."}}
"""

_OUTPUT_FORMAT = """
## Output Format
Each test case must follow this schema exactly (return all cases in the test_cases list):
{{
  "id": "TC-001",
  "title": "<short action-oriented title — describes what is being tested, not just the endpoint>",
  "module": "<API resource name, e.g. User Management, Authentication>",
  "test_type": "<Functional|Negative|Edge Case|Security|Performance>",
  "priority": "<P1-Critical|P2-High|P3-Medium|P4-Low>",
  "endpoint": "<HTTP method + path, e.g. POST /api/users>",
  "http_method": "<GET|POST|PUT|PATCH|DELETE>",
  "preconditions": ["<condition 1>", "<condition 2>"],
  "steps": [
    {{
      "step_number": 1,
      "action": "<exact action: method + path + request payload summary>",
      "expected_result": "<specific outcome: status code + full response body assertions>"
    }}
  ],
  "expected_result": "<overall expected outcome: status code + all response body field assertions>",
  "postconditions": ["<cleanup step if state was mutated>"],
  "test_data_hints": ["<field: description of required value, e.g. 'email: valid email format'>"],
  "notes": "<rationale, related error code, or field being boundary-tested>"
}}
"""


GENERATE_FEATURE_SCENARIO_PROMPT = """You are generating a Gherkin .feature file for BDD API test automation.

## Feature: {feature_name}
## Feature Tag: {feature_tag}

## Available API Names (EXACT names from the Postman collection — use these verbatim in steps)
{api_names}

## Full API Metadata (url, method, headers, request_payload, response_payload for each API)
{api_metadata}

## Test Data Rows (uploaded by the user — each row is one set of variable inputs)
{test_data}

## Manual Test Cases to convert
{test_cases}

---

## CRITICAL: You may ONLY use these four step types. No other steps allowed.

### Step Type 1 — Perform an API call
  user perform api call "<api_name>" and store response as "<response_var>" and validate status code "<status_code>"

- `<api_name>` MUST be an EXACT string from the Available API Names list above.
  - For happy-path/positive tests: use the primary API name for that endpoint.
  - For negative/error tests: look for a variant API name in the list that matches the scenario
    (e.g. an entry containing "Missing", "Invalid", or the relevant field name being tested).
    If no exact variant exists, use the primary API name.
- `<response_var>` = snake_case derived from the api_name + "_response"
  (e.g. "1. init dev" → "init_dev_response", "3. Standalone Identify" → "standalone_identify_response")
- `<status_code>` = expected HTTP status code string ("200", "400", "401", "403", "404", "500")

### Step Type 2 — Extract a value from a stored response
  user retrieve value from "<response_var>" using path "<json_path>" and store as "<var_name>"

- `<json_path>` = dot-notation path within the response JSON
  (e.g. "data.journeyId", "access_token", "data.accessToken", "id")
- Use the `response_payload` from the API Metadata above to determine real JSON paths.
- Only add retrieve steps for values ACTUALLY needed in later steps (e.g. auth tokens, resource IDs).

### Step Type 3 — Verify a response field
  user verify response field "<json_path>" "<operator>" "<value>" from "<response_var>"

- `<json_path>` = dot-notation path to the field being asserted
- `<operator>` = one of: equals | greater than | less than | contains | not contains
- `<value>` = the expected value formatted as:
  - Plain string:         "success", "Invalid request", "Request succeeded"
  - Integer as string:    str('0000'), str('9999'), str('8001')
  - Boolean:              True  or  False  (Python-style capitalised)
  - Null:                 None
  - JSON array:           ["error message 1", "error message 2"]
- Only add verify steps when the test case specifies CONCRETE expected field values.
  Do NOT add verify steps for negative tests that only check the status code.
- Use `response_payload` in the API Metadata to identify real field names and dot-notation paths.

### Step Type 4 — Store a value as a named variable (used before an API call)
  user store value "<value>" as "<var_name>"

- `<value>` = the literal value to store, OR a `<placeholder>` from a Scenario Outline Examples table.
  Examples of valid values:
  - Empty / no auth:        ""
  - Expired token:          "expired_token_xyz"
  - Malformed token:        "malformed###Bearer"
  - SQL injection:          "' OR '1'='1"
  - Long/overflow string:   "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  - Empty required field:   ""
  - Invalid data:           "invalid_data"
  - Non-Existing Data:       "99999"
- `<var_name>` = the field name this value overrides in the NEXT API call:
  - `"auth"` → overrides the Authorization header (set to `""` for no-auth tests)
  - Any other name (e.g. `"first_name"`, `"email"`, `"id"`) → overrides that request body field
- Place this step BEFORE the `user perform api call` step it affects.
- Use `Given` keyword for the first store step, `And` for subsequent store steps.

---

## Scenario writing rules
- Tags: first tag is `@{feature_tag}_<NNN>` (zero-padded 3 digits), then `@regression`,
  then `@sanity` for happy-path scenarios ONLY, then `@{feature_tag}`
- Scenario title = the test case `title` field (concise, human-readable)
- Keyword order: `Given` for the FIRST step; `When`, `And`, `Then`, `And` for subsequent steps
  - Setup/prerequisite API calls (tokens, dependent resources): Given / When / And
  - The primary API call under test: Then
  - Verify steps: And
- Order scenarios: positive/happy-path first, then negative/error cases, then edge cases

## Test Data → Scenario Outline and data-seeding rules
- Use Test Data mandated for positive tests, as they will need actual data to call api.
- In negative tests also whereever applicable, use the test data values as base and then apply the negative variation on top of that (e.g. missing auth token scenario still uses valid body from test data row 0, just without the auth header).
If the "Test Data Rows" section above contains actual rows (it is NOT "(none)"):

### Rule A — Positive / happy-path test cases → Scenario Outline
For every positive/happy-path test case (expected 2xx; `test_type` is Functional; title does NOT
contain "invalid", "missing", "error", "fail", "unauthorized", "forbidden", "duplicate"):
- Use `Scenario Outline:` instead of `Scenario:`
- In the primary API call step, replace concrete request-body values with `<column_name>`
  placeholders whose names exactly match the test data column headers.
- In `verify response field` steps, replace expected values that echo back input fields with
  `<column_name>` placeholders. Leave fixed/deterministic values (e.g. status codes, enum
  flags) as literals.
- Append an `Examples:` table immediately after the last step:
  - Header row: `| col1 | col2 | ... |` — one column per test data key
  - One data row per test data entry with the actual values

### Rule B1 — Auth-failure negative cases → Scenario Outline with stored auth
For negative/error test cases where the variation is the authentication credential
(no auth, expired token, malformed token, wrong role/insufficient permissions):
- Use `Scenario Outline:` (not plain `Scenario:`).
- Add `user store value "<auth_token>" as "auth"` as the FIRST step (Given keyword).
- The `user perform api call` step comes after (When keyword).
- Add `verify response field` steps for concrete error fields as normal (Then / And).
- Append an Examples table with a single column `| auth_token |` containing the specific bad value:
  - No auth (401):       leave the cell empty  `|  |`
  - Expired token (401): `| expired_token_xyz |`
  - Malformed token (401): `| malformed###Bearer |`
  - Wrong role (403):    `| low_privilege_token |`

### Rule B2 — Any negative case that injects a specific value → Scenario Outline

Decision test — apply to EVERY negative/error test case before choosing B2 or B3:
  Ask: "Does this scenario require passing a specific value in a request body field
        or the auth header in order to trigger the negative outcome?"
  → YES → apply Rule B2 (Scenario Outline + store value + Examples)
  → NO  → apply Rule B3 (plain Scenario)

Rule B2 applies regardless of the reason the value is "bad". The answer is YES for:
  - A non-numeric string where an integer is expected        (invalid data type)
  - A string longer than the maximum allowed length         (oversized / boundary)
  - A SQL-injection or script-injection string              (security)
  - An empty string or null for a required field            (missing value)
  - Whitespace-only input for a text field                  (whitespace edge case)
  - A past or future date where a current date is required  (date boundary)
  - A negative number where a positive number is expected   (numeric boundary)
  - A value that duplicates an existing resource's key      (duplicate / conflict)
  - A special-character or unicode string                   (encoding edge case)
  - An empty, expired, or malformed auth token              (auth variation)
  ... and ANY other case where the test hinges on WHAT value is sent.

The answer is NO (use Rule B3) only when there is no specific value to inject, e.g.:
  - Calling with a hardcoded non-existent resource ID (just use 9999 inline)
  - Calling an endpoint with no body at all

Steps when Rule B2 applies:
- Use `Scenario Outline:` (not plain `Scenario:`).
- For each field whose value drives the negative outcome, add BEFORE the API call:
    user store value "<col_name>" as "<field_name>"
  `<col_name>` is the Examples column header, written WITH angle brackets in the step.
  NEVER write the actual bad value as a literal in the step — it belongs only in Examples.
- Order: all store steps first (Given / And), then API call (When), then verifications (Then / And).
- Append an Examples table with one column per stored field.
  Use multiple rows to cover multiple bad-value variants (e.g. two injection strings).
- For duplicate-value scenarios: store the value once before the setup call (status 2xx),
  then reuse the same stored variable in the duplicate call (status 409) — this keeps both
  calls consistent without repeating the value.

### Rule B3 — No specific value to inject → plain Scenario
Use only when there is NO specific request body value or auth credential driving the error
(e.g. calling with a hardcoded non-existent ID, calling with no body at all).
Keep as plain `Scenario:` with hardcoded representative values.

### Rule C — E2E workflow test cases → use row[0] values, not dummy data
For every workflow / E2E test case that spans multiple API calls:
- Use the VALUES from the FIRST test data row for any request body fields that appear in
  the test data columns. Do NOT invent dummy strings like "fn", "ln", "1234".
- For verify steps that check fields echoed back from input, use the concrete value from
  row 0 (not a `<placeholder>` — workflows run once, not parameterized).

### Example — positive Scenario Outline (all rows)
```gherkin
  @TAG_001 @regression @sanity @TAG
  Scenario Outline: Add user with valid data
    Given user perform api call "AddUser" and store response as "add_user_response" and validate status code "200"
    Then user verify response field "first_name" "equals" "<first_name>" from "add_user_response"
    And  user verify response field "last_name"  "equals" "<last_name>"  from "add_user_response"
    Examples:
      | first_name | last_name | adid     |
      | Alice      | Smith     | AD100001 |
      | Bob        | Jones     | AD100002 |
```

### Example — Rule B1: auth-failure Scenario Outline
```gherkin
  @TAG_002 @regression @TAG
  Scenario Outline: Attempt to add user without authentication token
    Given user store value "<auth_token>" as "auth"
    When  user perform api call "AddUser" and store response as "add_user_response" and validate status code "401"
    Then  user verify response field "error"   "equals" "UNAUTHORIZED" from "add_user_response"
    And   user verify response field "message" "contains" "authentication" from "add_user_response"
    Examples:
      | auth_token |
      |            |
```

### Example — Rule B2: field-value Scenario Outline (invalid data type)
```gherkin
  @TAG_003 @regression @TAG
  Scenario Outline: Attempt to add user with invalid data types
    Given user store value "<invalid_id>" as "id"
    When  user perform api call "AddUser" and store response as "add_user_response" and validate status code "400"
    Then  user verify response field "error"   "equals" "VALIDATION_ERROR" from "add_user_response"
    And   user verify response field "message" "contains" "id" from "add_user_response"
    Examples:
      | invalid_id  |
      | not-a-number |
```
Notice: the step contains `"<invalid_id>"` (angle-bracket placeholder), NOT the literal string `"not-a-number"`.
The actual bad value appears ONLY in the Examples table.

### Example — Rule B2: field-value Scenario Outline (SQL injection)
```gherkin
  @TAG_009 @regression @TAG
  Scenario Outline: Attempt to add user with SQL injection in fields
    Given user store value "<first_name_value>" as "first_name"
    When  user perform api call "AddUser" and store response as "add_user_response" and validate status code "400"
    Then  user verify response field "error"   "equals" "VALIDATION_ERROR" from "add_user_response"
    And   user verify response field "message" "contains" "first_name" from "add_user_response"
    Examples:
      | first_name_value        |
      | ' OR '1'='1             |
      | 1; DROP TABLE users; -- |
```

### Example — Rule B2: field-value Scenario Outline (oversized / boundary value)
```gherkin
  @TAG_004 @regression @TAG
  Scenario Outline: Attempt to add user with oversized payload
    Given user store value "<oversized_first_name>" as "first_name"
    When  user perform api call "AddUser" and store response as "add_user_response" and validate status code "400"
    Then  user verify response field "error"   "equals" "VALIDATION_ERROR" from "add_user_response"
    And   user verify response field "message" "contains" "first_name" from "add_user_response"
    Examples:
      | oversized_first_name                                                              |
      | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
```

### Example — Rule B2: field-value Scenario Outline (duplicate value — two-call pattern)
```gherkin
  @TAG_006 @regression @TAG
  Scenario Outline: Attempt to add user with duplicate ID
    Given user store value "<duplicate_id>" as "id"
    And   user perform api call "AddUser" and store response as "first_add_response" and validate status code "200"
    When  user perform api call "AddUser" and store response as "add_user_response" and validate status code "409"
    Then  user verify response field "error"   "equals" "CONFLICT" from "add_user_response"
    And   user verify response field "message" "contains" "duplicate" from "add_user_response"
    Examples:
      | duplicate_id |
      | 1001         |
```
The `user store value "<duplicate_id>" as "id"` step is placed ONCE before both API calls.
Both calls share the same stored `id` value from Examples, ensuring the second call collides with the first.

### Example — Rule B3: plain Scenario for resource-not-found (no field injection needed)
```gherkin
  @TAG_011 @regression @TAG
  Scenario: Get user by ID with non-existent ID
    Given user perform api call "GetUserByID" and store response as "get_user_response" and validate status code "404"
    Then  user verify response field "error.code" "equals" "not_found" from "get_user_response"
```

---

## Output
Return ONLY the complete Gherkin feature file content. No markdown code fences, no explanation.
Start with:  Feature: {feature_name}
Separate each Scenario with a blank line.
"""


CONTEXT_SUMMARY_PROMPT = """You are a QA analyst. Read the context documents below and extract a concise summary for use in test case generation.

## Context Documents
{context}

## Extract and summarize:
1. **Feature/Purpose** — what feature or API flow is described
2. **Business Rules** — specific constraints, validations, or logic rules mentioned
3. **User Roles & Permissions** — who can do what
4. **Known Edge Cases** — any edge cases or error conditions explicitly documented
5. **Workflow Dependencies** — any ordering or sequencing requirements between operations
6. **Acceptance Criteria** — list each AC verbatim if present

Be concise. Use bullet points. Do not invent anything not in the documents.
Return only the summary, no preamble."""


GENERATE_TESTS_PROMPT = (
    """You are generating manual test cases from the following API context.

## API Context (retrieved from uploaded collection/spec)
{rag_context}

## Task
Generate comprehensive manual test cases covering ALL of the following for each endpoint present in the context:
1. Happy path — valid inputs producing 2xx responses
2. Authentication — missing token, expired token, malformed token
3. Authorization — valid auth but insufficient role/permission
4. Input validation — missing required fields, wrong data types, out-of-range values, boundary values, special characters, empty strings, null values
5. Error scenarios — every distinct 4xx/5xx response code visible in the context
6. Edge cases — empty collections, maximum length strings, numeric overflow, whitespace-only inputs

"""
    + _ASSERTION_QUALITY_RULES
    + _OUTPUT_FORMAT
    + "\nGenerate all test cases now.\n"
)

GENERATE_TESTS_BATCH_PROMPT = (
    """You are generating manual test cases for a specific batch of API endpoints.

## Endpoints in this batch
{endpoint_list}

## API Metadata (exact request structure — {{vars}} are variable placeholders, keep them as-is)
{api_metadata}

## Full API Context for these endpoints (request schemas, response schemas, example bodies)
{rag_context}

## Business Context Summary (from Jira tickets / context documents)
{context_summary}

## Test Data (uploaded by the user — each row is one set of valid variable inputs)
{test_data}

## Task
Generate comprehensive manual test cases for EACH endpoint listed above, covering ALL of the following:

### Category A — Independent API Tests
1. **Happy Path** — valid inputs, expected 2xx response; use exact field names from API Metadata above
2. **Authentication** — missing token (401), expired token (401), malformed/invalid token (401)
3. **Authorization** — valid auth but wrong role or insufficient permission (403)
4. **Input Validation** — missing required fields, wrong data types, out-of-range values, boundary values,
   special characters, oversized payloads, null values, empty strings, SQL-injection-style strings
5. **Error Scenarios** — every distinct 4xx/5xx response code visible in the context
6. **Edge Cases** — empty collections, maximum-length strings, numeric overflow, whitespace-only inputs
7. **Idempotency** — duplicate POST/PUT requests back-to-back; verify 409 conflict or idempotent behaviour
8. **Pagination / Filtering** — empty result sets, max page size, invalid page cursor or offset

Use the API Metadata section above to build exact request payloads in test steps (field names, header
keys, and URL structure). Keep all {{vars}} as variable placeholders — do not substitute literal values.
If the Business Context Summary contains acceptance criteria, map at least one test case to each AC.

If the "Test Data" section above contains actual rows (it is NOT "(none)"):
- Use the values from the FIRST test data row as concrete field values in happy-path test case steps
  and expected_result assertions (e.g. use the real `email` value instead of "valid@example.com").
- In `test_data_hints`, reference the actual column names from the test data.
- For negative test cases, use the first row's values as the base payload and describe the negative
  variation applied on top (e.g. "missing auth header with valid body from test data row 0").

"""
    + _ASSERTION_QUALITY_RULES
    + _OUTPUT_FORMAT
    + "\nGenerate test cases for ALL endpoints in this batch.\n"
)

GENERATE_WORKFLOW_PROMPT = (
    """You are generating end-to-end workflow test cases that chain multiple API endpoints together.
The goal is to simulate realistic user journeys AND to find scenarios that can break or destabilise the application.

## All Available Endpoints
{endpoint_list}

## Sample Endpoint Details (request schemas, response schemas, example bodies)
{context_sample}

## Business Context Summary (from Jira tickets / context documents)
{context_summary}

## Test Data (uploaded by the user — each row is one set of valid variable inputs)
{test_data}

## Task
Generate exactly {n_workflows} workflow test cases. Each test case MUST:
- Chain at least 2 different endpoints called in sequence
- Pass data between steps (e.g. use `id` returned in step 1 as a path param in step 2)
- For each step: specify exact HTTP method, path (keep {{vars}} as-is), headers, request payload
  with real field names, expected status code, AND full response body assertions
- If the "Test Data" section above contains actual rows (it is NOT "(none)"), use values from the
  FIRST test data row for request body fields — do NOT use placeholder strings like "fn", "ln", "1234"

Cover ALL of the following scenario types across your {n_workflows} test cases:

### Positive Workflows (include at least 1)
1. **Full Lifecycle** — create → read → update → delete; assert system state at every step
2. **Cross-resource dependency** — create parent resource → create child using parent's returned id
   → verify the relationship is reflected in subsequent GET calls

### Negative / Application-Breaking Workflows (include at least 2)
3. **Access after deletion** — create a resource → delete it → attempt GET / PUT / DELETE on the
   same resource → expect 404; verify no ghost data remains
4. **Privilege escalation attempt** — create a resource as User A → attempt to modify or delete it
   using User B's token → expect 403; verify the resource is unchanged
5. **Duplicate creation** — submit an identical create request twice in sequence → verify 409 Conflict
   or idempotent behaviour; assert the duplicate is NOT silently accepted
6. **Broken partial flow** — step 1 succeeds (resource created) → step 2 uses a deliberately bad
   payload (400/422) → verify step 1's side-effect is NOT left in an inconsistent state
7. **Stale reference** — create resource A → create resource B that references A → delete A →
   retrieve B → assert the response handles the missing reference correctly (error or null field)

### Corner Cases (include at least 1)
8. **Ordering violation** — call a retrieve or update endpoint BEFORE the resource has been created
   → verify 404 or empty list; then create it and verify correct retrieval works
9. **Token invalidation mid-flow** — step 1 with a valid token (succeeds) → step 2 with an
   expired or empty token → verify only step 2 fails (401) and step 1's state persists

"""
    + _ASSERTION_QUALITY_RULES
    + """
## Output Format
Each element must follow this schema (return all cases in the test_cases list):
{{
  "id": "TC-W01",
  "title": "<workflow-oriented title, e.g. 'Create user then attempt access after deletion'>",
  "module": "E2E Workflow",
  "test_type": "<Functional|Negative|Edge Case>",
  "priority": "<P1-Critical|P2-High|P3-Medium|P4-Low>",
  "endpoint": "<first endpoint in the chain>",
  "http_method": "<method of first step>",
  "preconditions": ["<setup condition>"],
  "steps": [
    {{
      "step_number": 1,
      "action": "<API 1: METHOD /path — exact payload with field names>",
      "expected_result": "<status code + response body field assertions + note values needed in later steps>"
    }},
    {{
      "step_number": 2,
      "action": "<API 2: METHOD /path using {{field}} from step 1 response>",
      "expected_result": "<status code + response body field assertions>"
    }}
  ],
  "expected_result": "<overall end-to-end outcome: final system state after all steps>",
  "postconditions": ["<cleanup steps>"],
  "test_data_hints": ["<field: description of value needed, e.g. 'user_id: id from step 1 response'>"],
  "notes": "<which APIs are chained, what data flows between steps, what application behaviour is being validated>"
}}

Return all workflow test cases in the test_cases list.
"""
)

IMPROVE_TESTS_PROMPT = """You are improving an existing set of manual test cases based on human reviewer feedback.

## Current Test Cases
{existing_test_cases}

## Human Reviewer Feedback
{feedback}

## Additional Context (if retrieved)
{rag_context}

## Task
- Address every point in the feedback
- Add missing test cases the reviewer identified
- Improve any test cases flagged as insufficient
- Do NOT remove test cases unless the reviewer explicitly asked you to
- Maintain the same JSON schema as the input

## Assertion depth requirement
While updating, also deepen any shallow assertions you find:
- If expected_result only mentions a status code, expand it to assert response body fields
- If steps are vague (e.g. "verify response is correct"), make them concrete with field names and values
- Apply the same standard as if generating these test cases fresh

Return all test cases (updated and unchanged) in the test_cases list.
"""

CLARIFICATION_PROMPT = """Based on the uploaded API specification, I need some additional context
to generate higher-quality test cases. Please provide any of the following that apply:

{missing_context_items}

You can paste the information directly in the chat, or attach a JIRA story, additional document, or test data file.
"""

TEST_DATA_SCHEMA_PROMPT = """You are a QA test data engineer. Analyze ONE API endpoint and its test cases to identify the variable input columns needed in a test data file for automation.

## Endpoint
{endpoint}

## Request body fields declared in the API spec
{body_fields}

## Test cases for this endpoint
{test_cases}

## Task
Identify exactly which test data columns a tester must provide per scenario for this endpoint.

Rules:
- DO NOT include `test_case_id` — rows are not linked to specific test cases by ID; the system determines which rows apply to positive test cases automatically
- Add one column per path parameter found in the endpoint URL (e.g. `{{user_id}}` → column `user_id`)
- For POST / PUT / PATCH endpoints, add one column per field listed in the API spec body fields
- Add `auth_token` ONLY if the test cases explicitly reference authentication, authorization, login, or bearer tokens
- NEVER include: `base_url`, `method`, `expected_status`, `expected_response_contains` — assertions live in the test case definition, not the data file
- These rows represent VALID inputs for positive/happy-path scenarios only; negative test cases use their own inline hardcoded values and will not consume these rows
- All column names must be snake_case

## Output
Return all columns in the columns list. Each column must have:
- name (snake_case string)
- type (data type string, e.g. string, integer, boolean)
- example (representative value string)
- required (boolean)"""

GENERATE_SINGLE_TEST_PROMPT = """Generate a single Playwright Python API test function for the test case below.

## Test Case
{test_case}

## Test Data column names
{columns}

## Context
- `TEST_DATA` is already defined at module level — reference it directly; do NOT redefine it.
- `api_request_context: APIRequestContext` fixture has `base_url` already set.
- `auth_token: str` fixture provides a default bearer token from env (may be empty).

## Playwright APIRequestContext — CRITICAL rules (violations cause AttributeError at runtime)

### Making HTTP requests
NEVER call `api_request_context.request(...)` — that method does NOT exist.
Use method-specific shortcuts OR `fetch` for dynamic methods:

  # Specific shortcuts (preferred):
  response = api_request_context.get(path, headers={{...}})
  response = api_request_context.post(path, data=json.dumps(payload), headers={{"Content-Type": "application/json", ...}})
  response = api_request_context.put(path, data=json.dumps(payload), headers={{"Content-Type": "application/json", ...}})
  response = api_request_context.patch(path, data=json.dumps(payload), headers={{"Content-Type": "application/json", ...}})
  response = api_request_context.delete(path, headers={{...}})

  # Generic fetch (when method is a variable):
  response = api_request_context.fetch(path, method=method.upper(), data=json.dumps(payload), headers={{"Content-Type": "application/json", ...}})

### Reading the response
- `response.status`   → integer status code  (NOT `response.status_code` — does NOT exist)
- `response.text()`   → response body as string  (METHOD — always call with parentheses)
- `response.json()`   → parsed dict/list  (METHOD — always call with parentheses)

## Assertion requirements — translate every claim in expected_result into Python code

The test case's `expected_result` and each `steps[*].expected_result` contain rich assertion
requirements. You MUST translate ALL of them into Python assertions. Examples:

### Status code
```python
assert response.status == 201, f"Expected 201, got {{response.status}}: {{response.text()}}"
```

### Field presence
```python
body = response.json()
assert "id" in body,        f"Missing 'id' in response: {{body}}"
assert "email" in body,     f"Missing 'email' in response: {{body}}"
assert "createdAt" in body, f"Missing 'createdAt' in response: {{body}}"
```

### Data type
```python
assert isinstance(body["id"], int),  f"'id' should be int, got {{type(body['id'])}}: {{body['id']}}"
assert isinstance(body["name"], str), f"'name' should be str, got {{type(body['name'])}}"
assert isinstance(body["active"], bool), f"'active' should be bool, got {{type(body['active'])}}"
assert isinstance(body["tags"], list),   f"'tags' should be list, got {{type(body['tags'])}}"
```

### Value assertions
```python
assert body["id"] > 0, f"'id' should be > 0, got {{body['id']}}"
assert body["email"] == row["email"], f"Expected email={{row['email']}}, got {{body['email']}}"
assert body["status"] == "active", f"Expected status='active', got {{body['status']}}"
assert len(body["name"]) > 0, f"'name' should not be empty"
```

### Absence of sensitive fields
```python
assert "password" not in body,     "Sensitive field 'password' must not appear in response"
assert "passwordHash" not in body, "Sensitive field 'passwordHash' must not appear in response"
```

### Error response structure
```python
assert response.status == 400, f"Expected 400, got {{response.status}}: {{response.text()}}"
body = response.json()
assert "message" in body or "error" in body, f"Error response should contain 'message' or 'error': {{body}}"
assert "id" not in body, "Success fields should not appear in error responses"
```

### List/array responses
```python
body = response.json()
assert isinstance(body, list), f"Expected list, got {{type(body)}}: {{body}}"
if body:
    item = body[0]
    assert "id" in item,   f"List items should have 'id': {{item}}"
    assert "name" in item, f"List items should have 'name': {{item}}"
```

### ISO timestamp format
```python
import re
assert re.match(r"\\d{{4}}-\\d{{2}}-\\d{{2}}T", body.get("createdAt", "")), \\
    f"'createdAt' should be ISO 8601, got {{body.get('createdAt')}}"
```

## Step 1 — Classify the test case as POSITIVE or NEGATIVE

A test case is **NEGATIVE** when ANY of these are true:
- `expected_result` contains an HTTP 4xx or 5xx status code (400, 401, 403, 404, 409, 422, 500 …)
- `expected_result` mentions "error", "invalid", "rejected", "missing", "unauthorized", "forbidden", "duplicate", "fail"
- `title` contains "invalid", "missing", "wrong", "empty", "null", "duplicate", "unauthorized", "forbidden", "error"
- The test explicitly supplies specific bad inputs (wrong password, omitted required field, etc.)

Everything else is **POSITIVE** (expects 2xx, happy path, valid inputs).

---

## Rules for POSITIVE test cases

1. Function: `def test_<snake_case_title>(api_request_context: APIRequestContext, auth_token: str, row: dict):`
2. Decorate with `@pytest.mark.parametrize("row", TEST_DATA)` — runs once per row in the test data file.
3. Parse `endpoint` to get method and path (e.g. `"POST /api/users"` → method=`"POST"`, path=`"/api/users"`).
4. Substitute path params from `row` (e.g. `/users/{{user_id}}` → `row.get("user_id", "")`).
5. Build request payload for POST/PUT/PATCH: `{{k: row[k] for k in columns if k not in path_params and k != "auth_token" and row.get(k)}}`.
6. Auth: `row.get("auth_token") or auth_token`.

## Rules for NEGATIVE test cases

1. Function: `def test_<snake_case_title>(api_request_context: APIRequestContext, auth_token: str):`  ← **NO** `row` parameter.
2. **DO NOT** add `@pytest.mark.parametrize` — this test runs exactly once with specific invalid inputs.
3. Inline the specific invalid / boundary value described in the test case directly in the function body.
   - e.g., missing required field → omit it from the payload dict
   - e.g., wrong password → hardcode `"wrong_password_123"`
   - e.g., duplicate email → hardcode `"duplicate@example.com"`
4. Path params: hardcode a representative value (e.g., `"nonexistent-id-999"` for a 404 test).
5. Auth: use `auth_token` fixture; for 401 tests use an empty string `""`.

---

## Common rules (apply to both POSITIVE and NEGATIVE)

- Add `@allure.feature`, `@allure.story`, `@allure.severity`, `@allure.title` decorators.
  Severity mapping from the test case `priority` field — use EXACTLY these values (no others exist):
  - P1-Critical → `@allure.severity(allure.severity_level.CRITICAL)`
  - P2-High     → `@allure.severity(allure.severity_level.CRITICAL)`
  - P3-Medium   → `@allure.severity(allure.severity_level.NORMAL)`
  - P4-Low      → `@allure.severity(allure.severity_level.MINOR)`
  Valid levels: CRITICAL, NORMAL, MINOR, TRIVIAL — there is NO `HIGH`, `BLOCKER`, or `LOW`.
- For EACH assertion block, wrap in `with allure.step("...")` using the step's action text.
- After each failed assertion, attach the response body:
  `allure.attach(response.text(), name="Response Body", attachment_type=allure.attachment_type.TEXT)`
- Implement EVERY assertion described in `expected_result` and `steps[*].expected_result` — do not skip any.

Return ONLY the decorated function definition. No imports, no TEST_DATA, no class wrapper, no markdown fences.
"""

GENERATE_PLAYWRIGHT_MODULE_PROMPT = """You are generating Playwright Python API test functions for a batch of test cases.

## Module: {module_name}
## Test Cases (generate one pytest function per test case)
{test_cases}

## Test Data columns available: {columns}
## Test Data rows (for reference — already embedded in TEST_DATA at module level):
{test_data}

## API Metadata (url, method, headers, request_payload, response_payload)
{api_metadata}

## Module-level context (already defined — do NOT emit in output)
- `TEST_DATA: list[dict]` — all test data rows, defined at module level
- `api_request_context: APIRequestContext` — session-scoped fixture, `base_url` already set
- `auth_token: str` — default Bearer token from env (may be empty)

---

## Step 1 — Classify each test case as POSITIVE or NEGATIVE

**NEGATIVE** when ANY of these are true:
- `expected_result` contains a 4xx/5xx status code
- `expected_result` mentions "error", "invalid", "rejected", "missing", "unauthorized", "forbidden", "duplicate", "fail"
- `title` contains "invalid", "missing", "wrong", "empty", "null", "duplicate", "unauthorized", "forbidden", "error"
- The test explicitly supplies specific bad inputs

Everything else is **POSITIVE** (expects 2xx, happy path).

---

## Rules for POSITIVE test cases

1. `def test_<snake_case_title>(api_request_context: APIRequestContext, auth_token: str, row: dict):`
2. Decorate with `@pytest.mark.parametrize("row", TEST_DATA)` — runs once per row.
3. Parse `endpoint` to get method and path (e.g. `"POST /api/users"` → method=`"POST"`, path=`"/api/users"`).
4. Substitute path params from `row` (e.g. `/users/{{user_id}}` → `row.get("user_id", "")`).
5. Build payload for POST/PUT/PATCH from row columns, excluding path params and `auth_token`.
6. Auth: `row.get("auth_token") or auth_token`.

## Rules for NEGATIVE test cases

1. `def test_<snake_case_title>(api_request_context: APIRequestContext, auth_token: str):`  ← NO `row` param
2. **NO** `@pytest.mark.parametrize` — runs exactly once with hardcoded bad inputs.
3. Inline the specific invalid/boundary value in the function body.
4. For 401 tests: use `""` as auth token.

---

## Common rules (apply to BOTH)

- Add `@allure.feature("{module_name}")`, `@allure.story`, `@allure.severity`, `@allure.title` decorators.
  Severity mapping from the test case `priority` field — use EXACTLY these values (no others exist):
  - P1-Critical → `@allure.severity(allure.severity_level.CRITICAL)`
  - P2-High     → `@allure.severity(allure.severity_level.CRITICAL)`
  - P3-Medium   → `@allure.severity(allure.severity_level.NORMAL)`
  - P4-Low      → `@allure.severity(allure.severity_level.MINOR)`
  Valid levels: CRITICAL, NORMAL, MINOR, TRIVIAL — there is NO `HIGH`, `BLOCKER`, or `LOW`.
- Wrap each assertion block in `with allure.step("...")` using the step's action text.
- On assertion failure, attach response body:
  `allure.attach(response.text(), name="Response Body", attachment_type=allure.attachment_type.TEXT)`
- Implement EVERY assertion from `expected_result` and `steps[*].expected_result`.
- Use `api_request_context.get/post/put/patch/delete` (never `.request(...)`).
- For POST/PUT/PATCH: pass body as `data=json.dumps(payload)` and include `"Content-Type": "application/json"` in headers.
  NEVER use `json=payload` — that keyword is not supported.
- `response.status` → int, `response.text()` → str (call with `()`), `response.json()` → dict/list (call with `()`).

## Assertion depth

Translate every claim in `expected_result` into Python assertions:
```python
assert response.status == 201, f"Expected 201, got {{response.status}}: {{response.text()}}"
body = response.json()
assert "id" in body, f"Missing 'id': {{body}}"
assert isinstance(body["id"], int), f"'id' must be int, got {{type(body['id'])}}"
assert body["email"] == row["email"], f"email mismatch: {{body['email']}}"
assert "password" not in body, "Sensitive field must not appear"
```

---

Return ONLY the function definitions — no imports, no TEST_DATA, no class, no markdown fences.
Separate functions with a single blank line.
"""

TEST_DATA_EXTRACTION_PROMPT = """You have been given manual test cases and test data rows.

## Manual Test Cases
{manual_test_cases}

## Test Data (uploaded by the tester — each row is one set of variable inputs)
{test_data}

## Task
Generate a complete Python test file using **Playwright Python API testing** (pytest-playwright).

### Core principle
Every test function is parametrized with ALL rows from TEST_DATA.
Each row contains the variable inputs for one execution of that test (e.g. different users, payloads, IDs).
This means if the tester provided 5 rows, every test function runs 5 times.

### Module-level test data constant
Embed the full test data list verbatim at the top of the file:
```python
TEST_DATA = [
    {{"name": "Alice", "email": "alice@test.com", "auth_token": "Bearer tok1"}},
    {{"name": "Bob",   "email": "bob@test.com",   "auth_token": "Bearer tok2"}},
    # ...all rows
]
```

### Parametrize every test with all rows
```python
@pytest.mark.parametrize("row", TEST_DATA)
def test_create_user(api_request_context, auth_token, row):
    ...
```

### Imports
```python
import re
import allure
import pytest
import json
from playwright.sync_api import APIRequestContext
```

### Fixtures (already in conftest.py — do NOT redefine)
- `api_request_context: APIRequestContext` — session-scoped, `base_url` already set
- `auth_token: str` — default Bearer token from env (may be empty)

### How to build the request path
Split the test case `endpoint` field to get method and path:
- `"POST /api/users"` → method=`POST`, path=`"/api/users"`
- Substitute path parameters: `path = re.sub(r"\\{{([^}}]+)\\}}", lambda m: str(row.get(m.group(1), m.group(0))), "/api/users/{{user_id}}")`

### How to build the request payload
For POST/PUT/PATCH: collect every column from the row that is NOT a path parameter and NOT `auth_token`:
```python
PATH_PARAMS = {{"user_id", "order_id"}}  # adjust per endpoint
EXCLUDED = PATH_PARAMS | {{"auth_token"}}
payload = {{k: v for k, v in row.items() if k not in EXCLUDED and v not in (None, "")}}
```
Omit `data` for GET/DELETE.

### How to assert — DEEP assertions required
Assertions come from the test case steps — NOT from test data columns.
Go beyond status codes. Implement ALL assertions mentioned in expected_result:

```python
# Status
assert response.status == 201, f"Expected 201, got {{response.status}}: {{response.text()}}"

# Parse body
body = response.json()

# Field presence
assert "id" in body, f"Missing 'id': {{body}}"
assert "email" in body, f"Missing 'email': {{body}}"

# Types
assert isinstance(body["id"], int), f"'id' must be int, got {{type(body['id'])}}"
assert isinstance(body["active"], bool), f"'active' must be bool"

# Values
assert body["email"] == row["email"], f"email mismatch: expected {{row['email']}}, got {{body['email']}}"
assert body["id"] > 0, f"id must be > 0, got {{body['id']}}"

# Absence of sensitive fields
assert "password" not in body, "password must not appear in response"

# Error responses
assert "message" in body, f"Error body must have 'message': {{body}}"
```

On assertion failure, attach the response body:
```python
allure.attach(response.text(), name="Response Body", attachment_type=allure.attachment_type.TEXT)
```

### Auth
```python
headers = {{}}
row_token = row.get("auth_token", "")
if row_token:
    headers["Authorization"] = row_token
elif auth_token:
    headers["Authorization"] = f"Bearer {{auth_token}}"
```

### Requirements
- Embed ALL test data rows as `TEST_DATA = [...]` at module level
- Parametrize EVERY test function with `@pytest.mark.parametrize("row", TEST_DATA)`
- Each test function maps to exactly one manual test case
- Add `@allure.feature`, `@allure.story`, `@allure.severity`, `@allure.title` decorators.
  Severity: P1/P2 → CRITICAL, P3 → NORMAL, P4 → MINOR. Valid levels: CRITICAL, NORMAL, MINOR, TRIVIAL only (no HIGH).
- For POST/PUT/PATCH bodies use `data=json.dumps(payload)` with `"Content-Type": "application/json"` header — NEVER `json=payload`.
- Add `with allure.step("...")` context managers per step from the test case
- Implement EVERY assertion described in expected_result and steps — do not skip any

Return ONLY the complete Python file content. No markdown code fences, no explanation.
"""
