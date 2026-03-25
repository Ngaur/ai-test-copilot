.PHONY: dev prod install test lint format report clean

# ── Local development (hot-reload) ──────────────────────────────────────────
dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# ── Production build ─────────────────────────────────────────────────────────
prod:
	docker-compose up --build

# ── Backend only (no Docker) ─────────────────────────────────────────────────
backend-dev:
	cd backend && uvicorn app.main:app --reload --port 8000

# ── Frontend only (no Docker) ────────────────────────────────────────────────
frontend-dev:
	cd frontend && npm run dev

# ── Install all deps ─────────────────────────────────────────────────────────
install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

# ── Tests ────────────────────────────────────────────────────────────────────
test:
	cd backend && pytest tests/ -v

# ── Lint ─────────────────────────────────────────────────────────────────────
lint:
	cd backend && ruff check app/
	cd frontend && npm run lint

# ── Format ───────────────────────────────────────────────────────────────────
format:
	cd backend && ruff format app/

# ── Allure report ────────────────────────────────────────────────────────────
report:
	allure generate backend/allure-results --clean -o backend/allure-report
	allure open backend/allure-report

# ── Clean generated artifacts ────────────────────────────────────────────────
clean:
	rm -rf backend/generated_tests/* backend/allure-results/* backend/allure-report/* data/uploads/* data/faiss_index/*
