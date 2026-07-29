# MedLink AI Triage Service

Internal-only FastAPI service for symptom-to-specialty matching. Never exposed
publicly — `apps/api` is the only caller, over the Docker network in compose
(`http://ai:8000`) or `localhost:8001` in local dev.

## Local development (outside Docker)

    cd apps/ai
    python3 -m venv .venv
    .venv/bin/pip install -r requirements-dev.txt
    .venv/bin/uvicorn app.main:app --port 8001 --reload

Set `AI_SERVICE_URL=http://localhost:8001` in `apps/api`'s `.env` (see the
repo root `.env.example`) so `apps/api` can reach this instance.

## Tests

    cd apps/ai
    .venv/bin/python -m pytest tests
    .venv/bin/ruff check .
    .venv/bin/mypy app
