# AI Test Copilot

An AI-powered copilot that generates manual and automated tests from API specifications, with a human-in-the-loop review and improvement cycle.

Upload a Postman collection, OpenAPI spec, PDF, or DOCX — the agent parses it, generates structured test cases, lets you review and refine them, then produces executable BDD feature files and Playwright tests backed by your real test data.

---

## Features

- **Multi-format ingestion** — Postman collections (JSON), OpenAPI/Swagger (YAML/JSON), PDF, DOCX, plain text
- **RAG-powered context** — documents are chunked and indexed into FAISS; context is retrieved per generation step
- **Structured manual test cases** — LLM generates test cases with ID, title, module, type, priority, steps, preconditions, expected results
- **Human-in-the-loop review** — approve or reject with feedback; the agent improves and re-presents until approved
- **Automated test generation** — produces Gherkin `.feature` files per module + a `test_generated.py` Playwright runner
- **Test data driven** — upload CSV, Excel, or JSON at any point; test data is woven into generated scenarios
- **Test execution + Allure reports** — runs pytest via subprocess, generates an Allure HTML report in-app
- **Excel export** — download all manual test cases as a formatted `.xlsx` file
- **Context documents** — attach supplementary docs (feature specs, workflow guides, READMEs) before session start
- **Jira integration** — fetch Jira tickets by key; they are ingested as context automatically
- **LLM-agnostic** — supports LiteLLM proxy, direct provider APIs (Anthropic, OpenAI), and local Ollama

---

## Architecture

### LangGraph Workflow

```
ingest_and_index
    └─> generate_test_cases          [INTERRUPT — optional early test data upload]
            └─> human_review         [INTERRUPT — approve or reject with feedback]
                    ├─ needs_improvement ─> improve_test_cases ─> human_review (loop)
                    └─ approved ──────> request_test_data      [INTERRUPT — await file upload]
                                              └─> generate_automated_tests  [INTERRUPT]
                                                      └─> execute_tests
                                                              └─> END
```

Each interrupt boundary maps to a UI state. The frontend polls `GET /chat/{thread_id}/status` between steps.

### Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.14, FastAPI, Uvicorn |
| Agent | LangGraph, LangChain |
| Vector store | FAISS (faiss-cpu) |
| LLM client | LangChain OpenAI-compatible (LiteLLM / Anthropic / Ollama) |
| Test execution | pytest, allure-pytest, playwright |
| Doc parsing | pypdf, docx2txt, openpyxl |
| Frontend | React 18, TypeScript, Vite |
| UI | TailwindCSS, Lucide React |
| State / data | Zustand, TanStack React Query, Axios |

---

## Project Structure

```
ai-test-copilot/
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── graph.py          # LangGraph state machine definition
│   │   │   ├── nodes.py          # Node functions (ingest, generate, improve, execute)
│   │   │   ├── prompts.py        # All LLM prompts
│   │   │   └── state.py          # TestCopilotState TypedDict
│   │   ├── api/v1/
│   │   │   ├── chat.py           # Chat + workflow endpoints
│   │   │   ├── documents.py      # Upload endpoints (spec, context, test data, Jira)
│   │   │   ├── report.py         # Allure report serving
│   │   │   ├── settings.py       # LLM / Jira settings endpoints
│   │   │   └── router.py
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic settings (reads from .env)
│   │   │   └── logging.py
│   │   ├── models/schemas.py     # Pydantic request/response models
│   │   ├── rag/
│   │   │   ├── ingestor.py       # File parsing + chunking
│   │   │   └── vector_store.py   # FAISS index per session
│   │   └── services/
│   │       ├── llm_service.py    # LLM / embedding client factory
│   │       ├── jira_service.py   # Jira REST client
│   │       └── test_data_parser.py
│   └── tests/
├── frontend/
│   └── src/                      # React + TypeScript application
├── artifacts/                    # Generated tests, Allure results/report (git-ignored)
└── .env                          # Environment configuration
```

---

## Setup

### Prerequisites

- Python 3.12+
- Node.js 18+
- An LLM endpoint: LiteLLM proxy, OpenAI-compatible API, or Ollama

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Copy and edit the environment file
cp ../.env.example ../.env
```

Start the server:

```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The UI will be available at `http://localhost:5173`.

---

## Configuration

All settings are read from a `.env` file at the project root (or `backend/.env`).

```env
# Deployment mode: local | deploy | ollama
ENV_MODE=local

# LLM (OpenAI-compatible endpoint)
LLM_BASE_URL=http://localhost:4000
LLM_API_KEY=sk-litellm
LLM_MODEL=gpt-4o
LLM_TEMPERATURE=0.0

# Embeddings
EMBEDDING_BASE_URL=http://localhost:4000
EMBEDDING_API_KEY=sk-litellm
EMBEDDING_MODEL=text-embedding-3-small

# Ollama (used when ENV_MODE=ollama)
OLLAMA_BASE_URL=http://localhost:11434

# RAG
FAISS_INDEX_PATH=data/faiss_index
CHUNK_SIZE=1024
CHUNK_OVERLAP=128
RETRIEVER_TOP_K=8

# File paths
UPLOAD_DIR=data/uploads
MAX_UPLOAD_SIZE_MB=20
GENERATED_TESTS_DIR=../artifacts/generated_tests
ALLURE_RESULTS_DIR=../artifacts/allure-results
ALLURE_REPORT_DIR=../artifacts/allure-report
```

Settings can also be updated at runtime via the Settings panel in the UI (`GET/POST /api/v1/settings`).

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/documents/upload` | Upload API spec / Postman collection |
| `POST` | `/api/v1/documents/context` | Upload supplementary context documents |
| `POST` | `/api/v1/documents/jira` | Fetch Jira tickets as context |
| `POST` | `/api/v1/documents/test-data` | Upload test data (CSV / Excel / JSON) |
| `POST` | `/api/v1/chat/start` | Start a new workflow thread for a session |
| `GET` | `/api/v1/chat/{thread_id}/status` | Poll current step and last AI message |
| `POST` | `/api/v1/chat/{thread_id}/review` | Submit approve / reject + feedback |
| `GET` | `/api/v1/chat/{thread_id}/test-cases` | Retrieve generated manual test cases |
| `GET` | `/api/v1/chat/{thread_id}/test-cases/export` | Download test cases as Excel |
| `GET` | `/api/v1/chat/{thread_id}/generated-test` | Retrieve generated feature files |
| `POST` | `/api/v1/chat/{thread_id}/execute` | Run automated tests |
| `GET` | `/api/v1/report/view/{path}` | Serve Allure HTML report |

---

## Workflow Walkthrough

1. **Upload** — drag and drop a Postman collection or OpenAPI spec (optionally attach context docs or Jira tickets)
2. **Parse & Index** — the backend chunks the spec and indexes it into a per-session FAISS store
3. **Generate test cases** — the LLM produces structured manual test cases grouped by module
4. **Review** — inspect each test case; approve the suite or provide feedback for improvement
5. **Upload test data** — supply a CSV/Excel/JSON file with real request payloads and expected values
6. **Generate automation** — the agent produces Gherkin `.feature` files per module and a Playwright pytest runner
7. **Execute** — run the test suite in-app; results and an Allure report are shown inline

---

## Running Tests

```bash
cd backend
pytest tests/ -v
```
