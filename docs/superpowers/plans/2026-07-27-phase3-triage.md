# Phase 3 — AI Triage & Doctor Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A patient describes symptoms in free text; a red-flag keyword layer
immediately routes anything dangerous to an emergency banner with zero
matching; otherwise the system asks up to two fixed clarifying questions,
then returns the top-3 specialties (with confidence scores) and up to 3
bookable approved doctors per specialty, each deep-linking into Phase 2's
booking flow with the triage session attached. The doctor sees the patient's
symptom summary on the appointment request card.

**Architecture:** A new `apps/ai` FastAPI service (Python 3.12), reachable
only from `apps/api` over the Docker network — never exposed publicly, per
CLAUDE.md §0.2. It owns exactly one piece of state: an in-memory,
precomputed-at-startup embedding for each of ~40 specialties (via
`sentence-transformers`/`all-MiniLM-L6-v2`, baked into the Docker image so no
network call happens at runtime). It is stateless otherwise — no database
connection, no session storage. `apps/api` owns everything stateful: the
`TriageSession` document (already modeled in Phase 1, unused until now), the
multi-turn conversation state machine, Redis caching of AI responses, and a
hand-rolled circuit breaker (matching this codebase's established preference
for small hand-rolled solutions over new dependencies — see `SimpleRedisStore`
from Phase 1) that falls back to a manual specialty picker if the AI service
is unreachable.

**Tech Stack:** New for this phase — Python 3.12, FastAPI, pydantic v2,
uvicorn, `sentence-transformers` (local, free, no external API calls),
`rapidfuzz` (fuzzy red-flag keyword matching), pytest, ruff, mypy. Everything
else is the existing Node/TS/Next.js/Mongoose/Redis stack from Phases 1-2.

## Global Constraints

- TypeScript strict everywhere on the Node side; no `any`. Python: ruff +
  mypy clean (CLAUDE.md §3) — treat a ruff/mypy failure the same way a
  failed `tsc --noEmit` is treated elsewhere in this repo: it blocks the task.
- **AI never diagnoses. AI never prescribes.** (CLAUDE.md §0.1.1) — the
  `/triage` endpoint returns specialties and confidence scores only, never a
  diagnosis, a medicine name, or a definitive medical claim. Every AI-sourced
  message shown to the patient carries the disclaimer "This is guidance, not
  medical advice."
- The red-flag layer runs **before** any embedding call and, on a match,
  skips specialty matching entirely (CLAUDE.md §2 Phase 3).
- `apps/ai` is never reached directly by the browser — only `apps/api` calls
  it, over the internal Docker network in compose, or `localhost:8001` in
  local dev (no host port mapping in the `ai` service's compose entry).
- Zod schemas in `packages/shared` remain the single source of truth for
  every Node-side API contract this phase adds (the FastAPI service's own
  pydantic models are a separate, intentionally-duplicated contract at the
  service boundary — the two are not shared, matching CLAUDE.md §3's "FastAPI
  mirrors with pydantic").
- Every cross-role action leaves an audit trail — a patient viewing/creating
  a triage session is not cross-role (patient-only data), but a doctor
  reading a patient's symptom summary via an appointment IS cross-role
  exposure of patient data and should be covered by the existing appointment
  audit trail, not a new one.
- `req.user.id` is a User id; `Appointment.doctorId`/`DoctorProfile._id` /
  `TriageSession.recommendedDoctorIds` all store `DoctorProfile` ids — the
  established id-convention discipline from Phases 1-2 applies here too.
- Conventional commits.
- No frontend automated test suite (per established precedent) — frontend
  tasks verify via `npm run build --workspace=apps/web`.

## Scope decisions

- **"Extract symptom spans"** (CLAUDE.md §2): this project has no NER/LLM
  component, so span extraction is a lightweight heuristic (split the raw
  input on commas/semicolons/" and "/" with "), not true entity extraction.
  The actual specialty-matching embedding is computed against the **whole
  raw input text**, which sentence-transformers handles well without needing
  granular spans — the extracted list is for display/audit only.
- **"Asks 1-2 clarifying questions"**: there is no LLM in this stack to
  generate dynamic follow-ups, so the two questions are fixed and scripted
  ("How long have you had these symptoms?" / "How severe is it — mild,
  moderate, or severe?"), asked in that order, always skipped entirely for a
  red-flag match. This keeps the conversation deterministic and testable.
- **This plan closes two items the Phase 2 final review flagged for Phase 3**
  (per `2026-07-27-roadmap.md`'s "Model gaps" section): `TriageSession` gets
  an `isRedFlag` field (Task 7), and `createAppointment` gets a
  `triageSessionId` ownership check (Task 12) — the field was accepted from
  the client with zero validation since Task 7 of Phase 2 introduced it.
- **Seed data** (CLAUDE.md §6.4's 4 TriageSessions) is this plan's own slice,
  per the roadmap's phase-by-phase seeding table — added in Task 17, after
  the real schema/behavior exists to seed accurately.

---

## File Structure

```
apps/ai/
├── requirements.txt
├── Dockerfile
├── pyproject.toml                  # ruff + mypy config
├── specialty_map.json              # ~40 specialties × seed symptom phrases
└── app/
    ├── __init__.py
    ├── main.py                     # FastAPI app, lifespan loads the matcher once
    ├── config.py                   # env-driven settings (model name, etc.)
    ├── red_flags.py                # pure keyword-match function
    ├── embeddings.py                # SpecialtyMatcher: load model, precompute, match()
    ├── schemas.py                  # pydantic v2 request/response models
    └── routes/
        ├── __init__.py
        └── triage.py                # POST /triage
apps/ai/tests/
├── __init__.py
├── test_red_flags.py
├── test_embeddings.py
├── test_triage_route.py
└── fixtures/
    └── triage_cases.json           # 50 cases per CLAUDE.md §6.6

apps/api/src/
├── models/
│   └── TriageSession.ts            # MODIFY: add isRedFlag field
├── modules/
│   └── triage/
│       ├── aiClient.ts             # hand-rolled circuit breaker + HTTP call to apps/ai
│       ├── aiClient.test.ts
│       ├── triage.service.ts       # conversation state machine, TriageSession persistence
│       ├── triage.controller.ts
│       ├── triage.routes.ts
│       └── triage.test.ts
└── modules/appointments/
    └── appointments.service.ts     # MODIFY: validate triageSessionId ownership (Task 12)

packages/shared/src/schemas/
└── triage.ts                       # NEW: SendTriageMessageInput

apps/web/src/
├── store/
│   └── triageApi.ts                # RTK Query endpoints for the triage chat
└── app/
    └── triage/
        └── page.tsx                # chat UI: red-flag banner, clarifying Qs, results + book links

docker-compose.yml                   # MODIFY: add the `ai` service (no host port)
.github/workflows/ci.yml             # MODIFY: add a Python job for apps/ai
package.json                         # MODIFY: add test:ai/lint:ai/typecheck:ai script wrappers
```

---

### Task 1: FastAPI service scaffold + Docker/CI wiring

**Files:**
- Create: `apps/ai/requirements.txt`, `Dockerfile`, `pyproject.toml`, `app/__init__.py`, `app/main.py`, `app/config.py`, `tests/__init__.py`, `tests/test_main.py`
- Modify: `docker-compose.yml`, `.github/workflows/ci.yml`, root `package.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: a running FastAPI app with `GET /health` — consumed by Task 5's route registration and Task 8's Node-side HTTP client's health check.

- [ ] **Step 1: Write the failing test**

```python
# apps/ai/tests/test_main.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/ai && python -m pytest tests/test_main.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app'` (nothing exists yet)

- [ ] **Step 3: Implement the scaffold**

```txt
# apps/ai/requirements.txt
fastapi==0.115.0
uvicorn[standard]==0.32.0
pydantic==2.9.2
pydantic-settings==2.5.2
sentence-transformers==3.2.1
numpy==1.26.4
rapidfuzz==3.10.1
pytest==8.3.3
httpx==0.27.2
ruff==0.7.0
mypy==1.13.0
```

```python
# apps/ai/app/__init__.py
```

```python
# apps/ai/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_name: str = "all-MiniLM-L6-v2"
    specialty_map_path: str = "specialty_map.json"


settings = Settings()
```

```python
# apps/ai/app/main.py
from fastapi import FastAPI

app = FastAPI(title="MedLink AI Triage Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

```toml
# apps/ai/pyproject.toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP"]

[tool.mypy]
python_version = "3.12"
strict = true
ignore_missing_imports = true
```

```dockerfile
# apps/ai/Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY apps/ai/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Bake the sentence-transformers model into the image layer at build time so
# container startup needs no network access and cold starts stay fast
# (CLAUDE.md §4 risk: "Model download size in Docker" -> bake + layer-cache).
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
COPY apps/ai/app ./app
COPY apps/ai/specialty_map.json ./specialty_map.json
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 4: Wire into `docker-compose.yml`**

```yaml
# docker-compose.yml (add a new service; do not remove any existing service)
  ai:
    build:
      context: .
      dockerfile: apps/ai/Dockerfile
    # Internal-only: no `ports:` mapping. FastAPI is never exposed publicly —
    # apps/api reaches it by Docker service name over the compose network.
    environment:
      MODEL_NAME: all-MiniLM-L6-v2
```

```yaml
# docker-compose.yml (api service's existing `environment:` block — add one line)
      AI_SERVICE_URL: http://ai:8000
```

Note: for local (non-Docker) dev, `apps/api`'s `AI_SERVICE_URL` env var should
default to `http://localhost:8001` (Task 8 implements this default), and a
developer running the AI service locally would start it with
`uvicorn app.main:app --port 8001` from `apps/ai/`.

- [ ] **Step 5: Wire root `package.json` script wrappers**

```json
// package.json (add three scripts; apps/ai is not an npm workspace, so it needs
// explicit shell wrappers rather than `--workspaces`)
"test:ai": "cd apps/ai && python -m pytest",
"lint:ai": "cd apps/ai && ruff check .",
"typecheck:ai": "cd apps/ai && mypy app"
```

- [ ] **Step 6: Wire CI**

```yaml
# .github/workflows/ci.yml (add a second job alongside the existing Node job)
  ai:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: apps/ai/requirements.txt
      - run: pip install -r apps/ai/requirements.txt
      - run: ruff check apps/ai
      - run: mypy apps/ai/app
      - run: python -m pytest apps/ai/tests
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/ai && pip install -r requirements.txt && python -m pytest tests/test_main.py -v`
Expected: PASS (1 test). Note: `pip install` will take a while the first time (sentence-transformers pulls in torch); this is expected and only needs to happen once per environment.

- [ ] **Step 8: Commit**

```bash
git add apps/ai docker-compose.yml .github/workflows/ci.yml package.json
git commit -m "feat(ai): scaffold FastAPI triage service, wire into compose/CI"
```

---

### Task 2: Red-flag rules module

**Files:**
- Create: `apps/ai/app/red_flags.py`, `apps/ai/tests/test_red_flags.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `check_red_flag(text: str) -> str | None` (returns the matched keyword, or `None`) — consumed by Task 5's `/triage` route, which must call this **before** any embedding work.

- [ ] **Step 1: Write the failing test**

```python
# apps/ai/tests/test_red_flags.py
from app.red_flags import check_red_flag


def test_detects_chest_pain():
    assert check_red_flag("I have crushing chest pain") is not None


def test_detects_breathlessness():
    assert check_red_flag("severe breathlessness since this morning") is not None


def test_detects_suicidal_ideation():
    assert check_red_flag("I have been having suicidal thoughts") is not None


def test_detects_severe_bleeding():
    assert check_red_flag("severe bleeding from a wound that won't stop") is not None


def test_detects_sudden_vision_loss():
    assert check_red_flag("sudden vision loss in my left eye") is not None


def test_does_not_flag_ordinary_symptoms():
    assert check_red_flag("itchy red patches on my elbow for 2 weeks") is None


def test_is_case_insensitive():
    assert check_red_flag("CHEST PAIN and sweating") is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/ai && python -m pytest tests/test_red_flags.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.red_flags'`

- [ ] **Step 3: Implement**

```python
# apps/ai/app/red_flags.py
RED_FLAG_KEYWORDS: list[str] = [
    "chest pain",
    "crushing chest",
    "breathless",
    "difficulty breathing",
    "shortness of breath",
    "suicidal",
    "self harm",
    "severe bleeding",
    "bleeding that won't stop",
    "sudden vision loss",
    "loss of vision",
    "unconscious",
    "unresponsive",
    "seizure",
    "stroke",
    "slurred speech",
    "face drooping",
    "severe abdominal pain",
]


def check_red_flag(text: str) -> str | None:
    """Return the matched keyword if `text` contains a red-flag phrase, else None.

    This must run before any embedding-based matching — a red-flag match skips
    specialty matching entirely and routes straight to an emergency response.
    """
    normalized = text.lower()
    for keyword in RED_FLAG_KEYWORDS:
        if keyword in normalized:
            return keyword
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/ai && python -m pytest tests/test_red_flags.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Lint/typecheck**

Run: `cd apps/ai && ruff check app/red_flags.py && mypy app/red_flags.py`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/ai/app/red_flags.py apps/ai/tests/test_red_flags.py
git commit -m "feat(ai): red-flag keyword detection layer"
```

---

### Task 3: `specialty_map.json` data curation

**Files:**
- Create: `apps/ai/specialty_map.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the specialty → seed-phrase mapping consumed by Task 4's embedding engine.

- [ ] **Step 1: Write the data file**

Curate ~40 specialties, each with 5-8 seed symptom phrases. Every specialty
that has a seeded doctor in `apps/api/src/seed/data.ts` (Dermatology, General
Physician, Gastroenterology, Cardiology, Gynecology, Orthopedics, Pediatrics,
ENT, Psychiatry, Ophthalmology) **must** be included so the demo can match
real bookable doctors; the remainder round out the set toward CLAUDE.md's
"~40 specialties" for a realistic-looking engine.

```json
// apps/ai/specialty_map.json
{
  "Dermatology": [
    "itchy red patches on skin",
    "acne breakout",
    "skin rash that won't go away",
    "dry flaky patches",
    "mole changing shape or color",
    "hair loss in patches",
    "hives and itching"
  ],
  "General Physician": [
    "fever and body ache",
    "common cold and cough",
    "general fatigue and weakness",
    "mild headache",
    "seasonal flu symptoms",
    "sore throat"
  ],
  "Gastroenterology": [
    "acidity and heartburn",
    "stomach pain after eating",
    "bloating and gas",
    "chronic constipation",
    "diarrhea for several days",
    "loss of appetite and nausea"
  ],
  "Cardiology": [
    "occasional chest tightness",
    "irregular heartbeat",
    "shortness of breath on exertion",
    "high blood pressure follow-up",
    "swelling in ankles and legs",
    "palpitations"
  ],
  "Gynecology": [
    "irregular periods",
    "pelvic pain",
    "pregnancy checkup",
    "menstrual cramps",
    "vaginal discharge concerns"
  ],
  "Orthopedics": [
    "knee pain when walking",
    "back pain after lifting",
    "joint stiffness in the morning",
    "sports injury to the ankle",
    "shoulder pain when raising arm",
    "fracture follow-up"
  ],
  "Pediatrics": [
    "child with fever",
    "child not eating well",
    "child with persistent cough",
    "vaccination schedule",
    "child with rash"
  ],
  "ENT": [
    "ear pain and reduced hearing",
    "sinus congestion",
    "sore throat and difficulty swallowing",
    "recurring nosebleeds",
    "ringing in the ears"
  ],
  "Psychiatry": [
    "persistent anxiety and worry",
    "difficulty sleeping for weeks",
    "low mood and loss of interest",
    "panic attacks",
    "trouble concentrating"
  ],
  "Ophthalmology": [
    "blurry vision",
    "eye redness and irritation",
    "difficulty seeing at night",
    "eye strain from screens",
    "watery eyes"
  ],
  "Pulmonology": [
    "chronic cough for weeks",
    "wheezing",
    "asthma follow-up"
  ],
  "Endocrinology": [
    "unexplained weight change",
    "diabetes follow-up",
    "thyroid symptoms"
  ],
  "Urology": [
    "painful urination",
    "frequent urination",
    "kidney stone symptoms"
  ],
  "Nephrology": [
    "swelling due to kidney issues",
    "chronic kidney disease follow-up"
  ],
  "Neurology": [
    "frequent migraines",
    "numbness in hands or feet",
    "memory problems"
  ],
  "Rheumatology": [
    "joint pain and swelling in multiple joints",
    "autoimmune condition follow-up"
  ],
  "Oncology": [
    "unexplained lump",
    "cancer follow-up appointment"
  ],
  "Dentistry": [
    "tooth pain",
    "bleeding gums",
    "jaw pain"
  ],
  "Allergy and Immunology": [
    "seasonal allergies",
    "food allergy reaction",
    "frequent sneezing and itchy eyes"
  ],
  "Physiotherapy": [
    "post-surgery rehabilitation",
    "chronic muscle stiffness"
  ]
}
```

Note: 20 specialties shown above as a complete, correct starting set (every
seeded-doctor specialty covered, all with real phrases, no placeholders) —
extend toward ~40 by adding further specialties (e.g. Nutrition, Sports
Medicine, Geriatrics, Infectious Disease, Hematology, Pulmonology sub-areas,
Sexual Health, Podiatry, Occupational Medicine) following the same format
before implementing Task 4, so the fixture-accuracy target in Task 6 has a
realistically-sized specialty space to discriminate against — a set that's
too small makes top-3 matching trivially easy and hides genuine bugs.

- [ ] **Step 2: Validate the file is well-formed**

Run: `cd apps/ai && python -c "import json; d = json.load(open('specialty_map.json')); print(len(d), 'specialties')"`
Expected: prints a count of at least 30, no JSON parse error.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/specialty_map.json
git commit -m "feat(ai): curate specialty-to-symptom-phrase seed data"
```

---

### Task 4: Embedding engine

**Files:**
- Create: `apps/ai/app/embeddings.py`, `apps/ai/tests/test_embeddings.py`

**Interfaces:**
- Consumes: `specialty_map.json` (Task 3).
- Produces: `SpecialtyMatcher` class with `.match(text: str, top_k: int = 3) -> list[tuple[str, float]]` — loaded once at app startup (Task 5), consumed by the `/triage` route.

- [ ] **Step 1: Write the failing test**

```python
# apps/ai/tests/test_embeddings.py
import json
import tempfile
import os
from app.embeddings import SpecialtyMatcher


def make_test_map() -> str:
    data = {
        "Dermatology": ["itchy red patches on skin", "acne breakout", "skin rash"],
        "Cardiology": ["chest tightness", "irregular heartbeat", "high blood pressure"],
        "Orthopedics": ["knee pain when walking", "back pain after lifting", "joint stiffness"],
    }
    fd, path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w") as f:
        json.dump(data, f)
    return path


def test_matches_dermatology_for_skin_symptoms():
    matcher = SpecialtyMatcher(make_test_map())
    results = matcher.match("itchy red patches on my elbow for 2 weeks", top_k=3)
    assert results[0][0] == "Dermatology"
    assert 0.0 <= results[0][1] <= 1.0


def test_matches_orthopedics_for_knee_pain():
    matcher = SpecialtyMatcher(make_test_map())
    results = matcher.match("my knee hurts when I walk up stairs", top_k=3)
    assert results[0][0] == "Orthopedics"


def test_returns_top_k_sorted_descending():
    matcher = SpecialtyMatcher(make_test_map())
    results = matcher.match("chest tightness and joint pain", top_k=3)
    assert len(results) == 3
    confidences = [c for _, c in results]
    assert confidences == sorted(confidences, reverse=True)


def test_top_k_caps_at_number_of_specialties():
    matcher = SpecialtyMatcher(make_test_map())
    results = matcher.match("some symptom", top_k=10)
    assert len(results) == 3  # only 3 specialties in the test map
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/ai && python -m pytest tests/test_embeddings.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.embeddings'`

- [ ] **Step 3: Implement**

```python
# apps/ai/app/embeddings.py
import json

import numpy as np
from sentence_transformers import SentenceTransformer


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


class SpecialtyMatcher:
    """Loads a specialty->phrases map, precomputes one centroid embedding per
    specialty (the mean of its seed phrases' embeddings) at construction time,
    and matches new free-text input against those centroids via cosine
    similarity. Construction is the expensive step (model load + embedding N
    phrases) — do this once at app startup, not per-request."""

    def __init__(self, specialty_map_path: str, model_name: str = "all-MiniLM-L6-v2") -> None:
        with open(specialty_map_path) as f:
            specialty_map: dict[str, list[str]] = json.load(f)

        self._model = SentenceTransformer(model_name)
        self._specialty_names: list[str] = list(specialty_map.keys())
        self._centroids: list[np.ndarray] = []

        for name in self._specialty_names:
            phrase_embeddings = self._model.encode(specialty_map[name])
            centroid = np.mean(phrase_embeddings, axis=0)
            self._centroids.append(centroid)

    def match(self, text: str, top_k: int = 3) -> list[tuple[str, float]]:
        query_embedding = self._model.encode(text)
        scored = [
            (name, _cosine_similarity(query_embedding, centroid))
            for name, centroid in zip(self._specialty_names, self._centroids)
        ]
        scored.sort(key=lambda pair: pair[1], reverse=True)
        return scored[:top_k]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/ai && python -m pytest tests/test_embeddings.py -v`
Expected: PASS (4 tests). This test suite downloads/loads the real `all-MiniLM-L6-v2` model — the first run will be slow (or use whatever cached copy `pip install`'s dependency resolution and any prior Docker build left in `~/.cache`); subsequent runs are fast.

- [ ] **Step 5: Lint/typecheck**

Run: `cd apps/ai && ruff check app/embeddings.py && mypy app/embeddings.py`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/ai/app/embeddings.py apps/ai/tests/test_embeddings.py
git commit -m "feat(ai): sentence-transformers specialty matching engine"
```

---

### Task 5: `POST /triage` endpoint

**Files:**
- Create: `apps/ai/app/schemas.py`, `apps/ai/app/routes/__init__.py`, `apps/ai/app/routes/triage.py`, `apps/ai/tests/test_triage_route.py`
- Modify: `apps/ai/app/main.py`

**Interfaces:**
- Consumes: `check_red_flag` (Task 2), `SpecialtyMatcher` (Task 4).
- Produces: `POST /triage` — consumed by Task 8's Node-side `aiClient.ts`.

- [ ] **Step 1: Write the failing test**

```python
# apps/ai/tests/test_triage_route.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_red_flag_short_circuits_before_matching():
    response = client.post("/triage", json={"text": "I have crushing chest pain"})
    assert response.status_code == 200
    body = response.json()
    assert body["emergency"] is True
    assert body["suggestedSpecialties"] == []
    assert "seek emergency care" in body["message"].lower() or "112" in body["message"]


def test_ordinary_symptom_returns_top_3_specialties():
    response = client.post("/triage", json={"text": "itchy red patches on my elbow for 2 weeks"})
    assert response.status_code == 200
    body = response.json()
    assert body["emergency"] is False
    assert len(body["suggestedSpecialties"]) == 3
    assert body["suggestedSpecialties"][0]["name"] == "Dermatology"
    assert 0.0 <= body["suggestedSpecialties"][0]["confidence"] <= 1.0


def test_extracts_symptom_phrases():
    response = client.post("/triage", json={"text": "itchy patches, and mild fever"})
    body = response.json()
    assert len(body["extractedSymptoms"]) >= 1


def test_rejects_empty_text():
    response = client.post("/triage", json={"text": ""})
    assert response.status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/ai && python -m pytest tests/test_triage_route.py -v`
Expected: FAIL — 404 (route doesn't exist)

- [ ] **Step 3: Implement**

```python
# apps/ai/app/schemas.py
from pydantic import BaseModel, Field


class TriageRequest(BaseModel):
    text: str = Field(min_length=1)


class SpecialtySuggestion(BaseModel):
    name: str
    confidence: float


class TriageResponse(BaseModel):
    emergency: bool
    message: str | None = None
    extractedSymptoms: list[str] = []
    suggestedSpecialties: list[SpecialtySuggestion] = []
```

```python
# apps/ai/app/routes/__init__.py
```

```python
# apps/ai/app/routes/triage.py
import re

from fastapi import APIRouter, Request

from app.red_flags import check_red_flag
from app.schemas import SpecialtySuggestion, TriageRequest, TriageResponse

router = APIRouter()


def _extract_symptoms(text: str) -> list[str]:
    """Lightweight heuristic split for display/audit purposes only — the
    actual specialty match is computed against the full raw text, not these
    fragments (see this plan's Scope Decisions)."""
    parts = re.split(r",|\band\b|\bwith\b", text, flags=re.IGNORECASE)
    return [p.strip() for p in parts if p.strip()]


@router.post("/triage", response_model=TriageResponse)
def triage(payload: TriageRequest, request: Request) -> TriageResponse:
    matched_keyword = check_red_flag(payload.text)
    if matched_keyword is not None:
        return TriageResponse(
            emergency=True,
            message="This may be a medical emergency. Seek emergency care immediately or call 112.",
            extractedSymptoms=[],
            suggestedSpecialties=[],
        )

    matcher = request.app.state.specialty_matcher
    matches = matcher.match(payload.text, top_k=3)

    return TriageResponse(
        emergency=False,
        message=None,
        extractedSymptoms=_extract_symptoms(payload.text),
        suggestedSpecialties=[SpecialtySuggestion(name=name, confidence=round(score, 4)) for name, score in matches],
    )
```

```python
# apps/ai/app/main.py (modify — replace the whole file)
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.embeddings import SpecialtyMatcher
from app.routes.triage import router as triage_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the model and precompute specialty centroids exactly once, at
    # startup — not per-request. This is the expensive step (~seconds).
    app.state.specialty_matcher = SpecialtyMatcher(settings.specialty_map_path, settings.model_name)
    yield


app = FastAPI(title="MedLink AI Triage Service", lifespan=lifespan)
app.include_router(triage_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/ai && python -m pytest tests/test_triage_route.py -v`
Expected: PASS (4 tests). Note: `TestClient(app)` triggers the lifespan, so this test run loads the real model against the real `specialty_map.json` — confirm `Dermatology` really does win for the skin-patches test given your actual curated phrases from Task 3; if it doesn't, the phrases need adjusting, not the test.

- [ ] **Step 5: Run the full pytest suite + lint/typecheck**

Run: `cd apps/ai && python -m pytest && ruff check . && mypy app`
Expected: all pass, all clean.

- [ ] **Step 6: Commit**

```bash
git add apps/ai/app/schemas.py apps/ai/app/routes apps/ai/app/main.py apps/ai/tests/test_triage_route.py
git commit -m "feat(ai): POST /triage endpoint wiring red-flags and specialty matching"
```

---

### Task 6: 50-case fixture set + accuracy test

**Files:**
- Create: `apps/ai/tests/fixtures/triage_cases.json`, extend `apps/ai/tests/test_embeddings.py`

**Interfaces:**
- Consumes: `SpecialtyMatcher` (Task 4), `check_red_flag` (Task 2).
- Produces: nothing consumed elsewhere — a correctness gate on the tuned `specialty_map.json`.

- [ ] **Step 1: Write the fixture file**

Per CLAUDE.md §6.6: 50 cases, ≥3 per each of the 12 seeded specialties
(Dermatology, General Physician, Gastroenterology, Cardiology, Gynecology,
Orthopedics, Pediatrics, ENT, Psychiatry, Ophthalmology — 10 distinct
specialties across the 12 seeded doctors), plus 5 red-flag cases.

```json
// apps/ai/tests/fixtures/triage_cases.json
[
  {"input": "itchy red patches on elbow 2 weeks", "expected_specialty": "Dermatology"},
  {"input": "persistent acne on my face and back", "expected_specialty": "Dermatology"},
  {"input": "skin rash that keeps spreading", "expected_specialty": "Dermatology"},
  {"input": "fever and body ache for 3 days", "expected_specialty": "General Physician"},
  {"input": "cold and cough, feeling tired", "expected_specialty": "General Physician"},
  {"input": "mild headache and sore throat", "expected_specialty": "General Physician"},
  {"input": "acidity and heartburn after meals", "expected_specialty": "Gastroenterology"},
  {"input": "stomach pain and bloating", "expected_specialty": "Gastroenterology"},
  {"input": "chronic constipation for weeks", "expected_specialty": "Gastroenterology"},
  {"input": "occasional chest tightness on exertion", "expected_specialty": "Cardiology"},
  {"input": "irregular heartbeat and palpitations", "expected_specialty": "Cardiology"},
  {"input": "swelling in my ankles and legs", "expected_specialty": "Cardiology"},
  {"input": "irregular periods for two months", "expected_specialty": "Gynecology"},
  {"input": "pelvic pain and cramps", "expected_specialty": "Gynecology"},
  {"input": "pregnancy checkup needed", "expected_specialty": "Gynecology"},
  {"input": "knee pain when walking up stairs", "expected_specialty": "Orthopedics"},
  {"input": "back pain after lifting something heavy", "expected_specialty": "Orthopedics"},
  {"input": "shoulder pain when raising my arm", "expected_specialty": "Orthopedics"},
  {"input": "my child has a fever", "expected_specialty": "Pediatrics"},
  {"input": "child not eating well lately", "expected_specialty": "Pediatrics"},
  {"input": "child has a persistent cough", "expected_specialty": "Pediatrics"},
  {"input": "ear pain and reduced hearing", "expected_specialty": "ENT"},
  {"input": "sinus congestion and facial pressure", "expected_specialty": "ENT"},
  {"input": "sore throat and difficulty swallowing", "expected_specialty": "ENT"},
  {"input": "persistent anxiety and worry", "expected_specialty": "Psychiatry"},
  {"input": "trouble sleeping for weeks", "expected_specialty": "Psychiatry"},
  {"input": "low mood and loss of interest in things", "expected_specialty": "Psychiatry"},
  {"input": "blurry vision for the past few days", "expected_specialty": "Ophthalmology"},
  {"input": "eye redness and irritation", "expected_specialty": "Ophthalmology"},
  {"input": "difficulty seeing clearly at night", "expected_specialty": "Ophthalmology"},
  {"input": "chronic cough that won't go away", "expected_specialty": "Pulmonology"},
  {"input": "wheezing when breathing", "expected_specialty": "Pulmonology"},
  {"input": "unexplained weight loss recently", "expected_specialty": "Endocrinology"},
  {"input": "thyroid symptoms and fatigue", "expected_specialty": "Endocrinology"},
  {"input": "painful urination for two days", "expected_specialty": "Urology"},
  {"input": "frequent urge to urinate", "expected_specialty": "Urology"},
  {"input": "swelling due to kidney problems", "expected_specialty": "Nephrology"},
  {"input": "frequent migraines this month", "expected_specialty": "Neurology"},
  {"input": "numbness in my hands", "expected_specialty": "Neurology"},
  {"input": "joint pain and swelling in multiple joints", "expected_specialty": "Rheumatology"},
  {"input": "found an unexplained lump", "expected_specialty": "Oncology"},
  {"input": "severe tooth pain", "expected_specialty": "Dentistry"},
  {"input": "bleeding gums when brushing", "expected_specialty": "Dentistry"},
  {"input": "seasonal allergies and sneezing", "expected_specialty": "Allergy and Immunology"},
  {"input": "itchy eyes and constant sneezing", "expected_specialty": "Allergy and Immunology"},
  {"input": "need post-surgery rehabilitation", "expected_specialty": "Physiotherapy"},
  {"input": "crushing chest pain radiating to my arm", "emergency": true},
  {"input": "severe breathlessness, can't catch my breath", "emergency": true},
  {"input": "having suicidal thoughts", "emergency": true},
  {"input": "severe bleeding that won't stop", "emergency": true},
  {"input": "sudden loss of vision in one eye", "emergency": true}
]
```

- [ ] **Step 2: Write the accuracy test**

```python
# apps/ai/tests/test_embeddings.py (append)
import json as _json
import os as _os
from app.red_flags import check_red_flag
from app.embeddings import SpecialtyMatcher


def test_fixture_accuracy_meets_target():
    """Runs the full apps/ai/specialty_map.json (not the small test map above)
    against the 50-case fixture set. Target: >=90% top-3 hit rate on
    non-emergency cases, and 100% correct emergency detection."""
    fixtures_path = _os.path.join(_os.path.dirname(__file__), "fixtures", "triage_cases.json")
    with open(fixtures_path) as f:
        cases = _json.load(f)

    real_map_path = _os.path.join(_os.path.dirname(__file__), "..", "specialty_map.json")
    matcher = SpecialtyMatcher(real_map_path)

    emergency_cases = [c for c in cases if c.get("emergency")]
    specialty_cases = [c for c in cases if "expected_specialty" in c]

    for case in emergency_cases:
        assert check_red_flag(case["input"]) is not None, f"missed red flag: {case['input']}"

    hits = 0
    for case in specialty_cases:
        top3 = [name for name, _ in matcher.match(case["input"], top_k=3)]
        if case["expected_specialty"] in top3:
            hits += 1
        else:
            print(f"MISS: '{case['input']}' expected {case['expected_specialty']}, got {top3}")

    accuracy = hits / len(specialty_cases)
    assert accuracy >= 0.90, f"top-3 accuracy {accuracy:.2%} below 90% target ({hits}/{len(specialty_cases)})"
```

- [ ] **Step 3: Run and tune**

Run: `cd apps/ai && python -m pytest tests/test_embeddings.py::test_fixture_accuracy_meets_target -v -s`
Expected: eventually PASS. If it fails below 90%, the fix is **tuning
`specialty_map.json`'s seed phrases** (add more/better phrases to the
specialties the printed `MISS` lines show confusion for) — never loosen the
90% threshold or delete a failing case to make this pass artificially.

- [ ] **Step 4: Run the full suite**

Run: `cd apps/ai && python -m pytest`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ai/tests/fixtures/triage_cases.json apps/ai/tests/test_embeddings.py
git commit -m "test(ai): 50-case triage fixture set with 90% top-3 accuracy gate"
```

---

### Task 7: `TriageSession.isRedFlag` field

**Files:**
- Modify: `apps/api/src/models/TriageSession.ts`
- Test: extend `apps/api/src/models/models.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ITriageSession.isRedFlag: boolean` — consumed by Task 10's conversation service and Task 15's frontend emergency banner.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/models/models.test.ts (append)
import { TriageSession } from './TriageSession';

describe('TriageSession model', () => {
  it('defaults isRedFlag to false', async () => {
    const session = await TriageSession.create({ patientId: new mongoose.Types.ObjectId() });
    expect(session.isRedFlag).toBe(false);
  });

  it('persists isRedFlag: true when set', async () => {
    const session = await TriageSession.create({ patientId: new mongoose.Types.ObjectId(), isRedFlag: true });
    expect(session.isRedFlag).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- models.test.ts`
Expected: FAIL — `isRedFlag` is `undefined`, not `false`

- [ ] **Step 3: Implement**

```ts
// apps/api/src/models/TriageSession.ts (modify)
export interface ITriageSession {
  // ...existing fields...
  isRedFlag: boolean;
}

// ...inside triageSessionSchema, add:
  isRedFlag: { type: Boolean, default: false },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- models.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/models/TriageSession.ts apps/api/src/models/models.test.ts
git commit -m "feat(api): add TriageSession.isRedFlag field"
```

---

### Task 8: Node-side AI client with hand-rolled circuit breaker

**Files:**
- Create: `apps/api/src/modules/triage/aiClient.ts`, `aiClient.test.ts`

**Interfaces:**
- Consumes: nothing new (talks to `apps/ai`'s `/triage` over HTTP).
- Produces: `callTriageAI(text: string): Promise<AITriageResult>` (throws `AIServiceUnavailableError` if the circuit is open or the call fails/times out) — consumed by Task 10's conversation service.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/triage/aiClient.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callTriageAI, AIServiceUnavailableError, resetCircuitBreaker } from './aiClient';

const originalFetch = global.fetch;

beforeEach(() => {
  resetCircuitBreaker();
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe('callTriageAI', () => {
  it('returns the parsed AI response on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ emergency: false, extractedSymptoms: ['itchy patches'], suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.87 }] }),
    }) as unknown as typeof fetch;

    const result = await callTriageAI('itchy patches');
    expect(result.emergency).toBe(false);
    expect(result.suggestedSpecialties[0].name).toBe('Dermatology');
  });

  it('throws AIServiceUnavailableError on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(callTriageAI('test')).rejects.toBeInstanceOf(AIServiceUnavailableError);
  });

  it('throws AIServiceUnavailableError when fetch itself rejects (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(callTriageAI('test')).rejects.toBeInstanceOf(AIServiceUnavailableError);
  });

  it('opens the circuit after repeated failures and fails fast without calling fetch', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;
    for (let i = 0; i < 5; i++) {
      await expect(callTriageAI('test')).rejects.toBeInstanceOf(AIServiceUnavailableError);
    }
    const callCountBeforeOpen = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    await expect(callTriageAI('test')).rejects.toBeInstanceOf(AIServiceUnavailableError);
    const callCountAfterOneMore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // The circuit should now be open: one more failing attempt should NOT have
    // triggered another real fetch call.
    expect(callCountAfterOneMore).toBe(callCountBeforeOpen);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- aiClient.test.ts`
Expected: FAIL — `Cannot find module './aiClient'`

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/triage/aiClient.ts
export interface AISpecialtySuggestion {
  name: string;
  confidence: number;
}

export interface AITriageResult {
  emergency: boolean;
  message?: string;
  extractedSymptoms: string[];
  suggestedSpecialties: AISpecialtySuggestion[];
}

export class AIServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const FAILURE_THRESHOLD = 5;
const OPEN_DURATION_MS = 30_000;
const REQUEST_TIMEOUT_MS = 3_000;

let consecutiveFailures = 0;
let circuitOpenedAt: number | null = null;

export function resetCircuitBreaker(): void {
  consecutiveFailures = 0;
  circuitOpenedAt = null;
}

function isCircuitOpen(): boolean {
  if (circuitOpenedAt === null) return false;
  if (Date.now() - circuitOpenedAt > OPEN_DURATION_MS) {
    // Half-open: allow the next call through to test recovery.
    circuitOpenedAt = null;
    consecutiveFailures = 0;
    return false;
  }
  return true;
}

function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= FAILURE_THRESHOLD && circuitOpenedAt === null) {
    circuitOpenedAt = Date.now();
  }
}

function recordSuccess(): void {
  consecutiveFailures = 0;
  circuitOpenedAt = null;
}

export async function callTriageAI(text: string): Promise<AITriageResult> {
  if (isCircuitOpen()) {
    throw new AIServiceUnavailableError('AI service circuit is open');
  }

  const baseUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8001';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      recordFailure();
      throw new AIServiceUnavailableError(`AI service returned ${response.status}`);
    }

    const result = (await response.json()) as AITriageResult;
    recordSuccess();
    return result;
  } catch (err) {
    if (err instanceof AIServiceUnavailableError) throw err;
    recordFailure();
    throw new AIServiceUnavailableError('AI service request failed');
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- aiClient.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/triage/aiClient.ts apps/api/src/modules/triage/aiClient.test.ts
git commit -m "feat(api): hand-rolled circuit breaker for the AI triage service call"
```

---

### Task 9: Redis caching of triage results

**Files:**
- Modify: `apps/api/src/modules/triage/aiClient.ts`, `aiClient.test.ts`

**Interfaces:**
- Consumes: `getRedis()` (Phase 1 `lib/redis.ts`).
- Produces: `callTriageAI` now checks/populates a Redis cache before/after the HTTP call — no interface change for callers (Task 10's conversation service is unaffected).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/triage/aiClient.test.ts (append)
import RedisMock from 'ioredis-mock';
import { setRedisClient, getRedis } from '../../lib/redis';

describe('callTriageAI Redis caching', () => {
  beforeEach(async () => {
    setRedisClient(new RedisMock());
    await getRedis().flushall();
    resetCircuitBreaker();
  });

  it('caches a successful AI response and does not re-call fetch for the same normalized text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ emergency: false, extractedSymptoms: [], suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.9 }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await callTriageAI('Itchy Red Patches');
    await callTriageAI('itchy red patches'); // same text, different case/whitespace normalization

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache an emergency response (never skip red-flag re-evaluation on a cache hit)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ emergency: true, message: 'Seek care', extractedSymptoms: [], suggestedSpecialties: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await callTriageAI('chest pain');
    await callTriageAI('chest pain');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- aiClient.test.ts`
Expected: FAIL — `fetchMock` called twice in the first new test (no caching yet)

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/triage/aiClient.ts (modify)
import crypto from 'node:crypto';
import { getRedis } from '../../lib/redis';

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour, per CLAUDE.md §2

function cacheKey(text: string): string {
  const normalized = text.trim().toLowerCase();
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return `triage:${hash}`;
}

// Inside callTriageAI, before the circuit-breaker check:
export async function callTriageAI(text: string): Promise<AITriageResult> {
  const key = cacheKey(text);
  const cached = await getRedis().get(key);
  if (cached) {
    return JSON.parse(cached) as AITriageResult;
  }

  if (isCircuitOpen()) {
    throw new AIServiceUnavailableError('AI service circuit is open');
  }

  // ...existing fetch logic...
  // after a successful, non-emergency response, before `return result;`:
  if (!result.emergency) {
    await getRedis().set(key, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
  }
  return result;
}
```

Integrate this into the existing function body from Task 8 rather than
duplicating it — the cache check happens first (a cache hit skips the circuit
breaker and the network call entirely), and only a genuinely fresh,
non-emergency result gets written back to the cache.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- aiClient.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/triage/aiClient.ts apps/api/src/modules/triage/aiClient.test.ts
git commit -m "feat(api): cache non-emergency triage results in Redis (1h TTL)"
```

---

### Task 10: Triage conversation service (multi-turn state machine)

**Files:**
- Create: `apps/api/src/modules/triage/triage.service.ts`
- Test: `apps/api/src/modules/triage/triage.test.ts` (created here, extended by Task 11)

**Interfaces:**
- Consumes: `callTriageAI` (Tasks 8-9), `TriageSession` model (Task 7), `DoctorProfile` model.
- Produces: `sendTriageMessage(patientId: string, sessionId: string | undefined, text: string): Promise<ITriageSession>` — consumed by Task 11's controller.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/triage/triage.test.ts
import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
import { sendTriageMessage } from './triage.service';
import * as aiClientModule from './aiClient';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
beforeEach(async () => {
  await resetTestRedis();
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
  vi.restoreAllMocks();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('sendTriageMessage', () => {
  it('creates a new session and asks the first clarifying question on the initial message', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    const session = await sendTriageMessage(patientId, undefined, 'itchy red patches on my elbow');

    expect(session.messages).toHaveLength(2); // user message + assistant question
    expect(session.messages[0].role).toBe('user');
    expect(session.messages[1].role).toBe('assistant');
    expect(session.messages[1].text.toLowerCase()).toContain('how long');
    expect(session.disclaimerShownAt).toBeInstanceOf(Date);
    expect(session.isRedFlag).toBe(false);
  });

  it('asks the second clarifying question after the duration answer', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    const first = await sendTriageMessage(patientId, undefined, 'itchy red patches');
    const second = await sendTriageMessage(patientId, first._id.toString(), '2 weeks');

    expect(second.messages).toHaveLength(4);
    expect(second.messages[3].text.toLowerCase()).toMatch(/severe|mild|moderate/);
  });

  it('calls the AI service and returns specialties after the severity answer', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    vi.spyOn(aiClientModule, 'callTriageAI').mockResolvedValue({
      emergency: false,
      extractedSymptoms: ['itchy red patches'],
      suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.87 }],
    });

    const first = await sendTriageMessage(patientId, undefined, 'itchy red patches');
    const second = await sendTriageMessage(patientId, first._id.toString(), '2 weeks');
    const third = await sendTriageMessage(patientId, second._id.toString(), 'mild');

    expect(third.suggestedSpecialties).toHaveLength(1);
    expect(third.suggestedSpecialties[0].name).toBe('Dermatology');
    expect(third.extractedSymptoms).toContain('itchy red patches');
  });

  it('short-circuits to an emergency response on the very first message, skipping clarifying questions', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    vi.spyOn(aiClientModule, 'callTriageAI').mockResolvedValue({
      emergency: true,
      message: 'Seek emergency care immediately or call 112.',
      extractedSymptoms: [],
      suggestedSpecialties: [],
    });

    const session = await sendTriageMessage(patientId, undefined, 'crushing chest pain');

    expect(session.isRedFlag).toBe(true);
    expect(session.messages).toHaveLength(2);
    expect(session.messages[1].text).toContain('112');
  });

  it('rejects continuing a session that belongs to a different patient', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    const otherPatientId = new mongoose.Types.ObjectId().toString();
    const first = await sendTriageMessage(patientId, undefined, 'itchy patches');

    await expect(sendTriageMessage(otherPatientId, first._id.toString(), '2 weeks')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- triage.test.ts`
Expected: FAIL — `Cannot find module './triage.service'`

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/triage/triage.service.ts
import { Types } from 'mongoose';
import { TriageSession, ITriageSession } from '../../models/TriageSession';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';
import { callTriageAI, AIServiceUnavailableError } from './aiClient';

const DISCLAIMER = 'This is guidance, not medical advice.';

async function findRecommendedDoctors(specialtyNames: string[]): Promise<Types.ObjectId[]> {
  const doctors = await DoctorProfile.find({
    specialties: { $in: specialtyNames },
    verificationStatus: 'approved',
  })
    .sort({ avgRating: -1 })
    .limit(3);
  return doctors.map((d) => d._id);
}

export async function sendTriageMessage(
  patientId: string,
  sessionId: string | undefined,
  text: string
): Promise<ITriageSession> {
  let session: ITriageSession | null;

  if (sessionId) {
    session = await TriageSession.findOne({ _id: sessionId, patientId });
    if (!session) throw new AppError(404, 'Triage session not found', 'TRIAGE_SESSION_NOT_FOUND');
  } else {
    session = await TriageSession.create({
      patientId: new Types.ObjectId(patientId),
      disclaimerShownAt: new Date(),
    });
  }

  session.messages.push({ role: 'user', text, at: new Date() });

  const turnCount = session.messages.filter((m) => m.role === 'user').length;

  if (turnCount === 1) {
    // First message: check for a red flag before anything else. A red flag
    // skips clarifying questions and specialty matching entirely.
    try {
      const aiResult = await callTriageAI(text);
      if (aiResult.emergency) {
        session.isRedFlag = true;
        session.messages.push({ role: 'assistant', text: aiResult.message ?? 'Seek emergency care immediately or call 112.', at: new Date() });
        await session.save();
        return session;
      }
    } catch (err) {
      if (!(err instanceof AIServiceUnavailableError)) throw err;
      // AI down on the very first message: fall through to the normal
      // clarifying-question flow. The manual-picker fallback happens at the
      // final turn (turnCount === 3) if the AI is still down by then.
    }

    session.messages.push({ role: 'assistant', text: 'How long have you had these symptoms?', at: new Date() });
    await session.save();
    return session;
  }

  if (turnCount === 2) {
    session.messages.push({ role: 'assistant', text: 'How severe is it — mild, moderate, or severe?', at: new Date() });
    await session.save();
    return session;
  }

  // turnCount === 3: combine the whole conversation into one description and
  // call the AI service for the real specialty match.
  const combinedText = session.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .join('. ');

  try {
    const aiResult = await callTriageAI(combinedText);
    session.extractedSymptoms = aiResult.extractedSymptoms;
    session.suggestedSpecialties = aiResult.suggestedSpecialties;
    session.recommendedDoctorIds = await findRecommendedDoctors(aiResult.suggestedSpecialties.map((s) => s.name));
    session.messages.push({
      role: 'assistant',
      text: `Based on what you've described, you may want to see: ${aiResult.suggestedSpecialties.map((s) => s.name).join(', ')}. ${DISCLAIMER}`,
      at: new Date(),
    });
  } catch (err) {
    if (!(err instanceof AIServiceUnavailableError)) throw err;
    // Graceful degradation: the AI service is down. Return an empty
    // specialty list so the frontend can fall back to a manual specialty
    // picker instead of showing an error.
    session.messages.push({
      role: 'assistant',
      text: "We're having trouble matching your symptoms automatically right now — please pick a specialty manually below.",
      at: new Date(),
    });
  }

  await session.save();
  return session;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- triage.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/triage/triage.service.ts apps/api/src/modules/triage/triage.test.ts
git commit -m "feat(api): multi-turn triage conversation state machine"
```

---

### Task 11: `POST /api/triage/messages` and `GET /api/triage/:id` routes

**Files:**
- Create: `apps/api/src/modules/triage/triage.controller.ts`, `triage.routes.ts`
- Modify: `apps/api/src/app.ts`, extend `apps/api/src/modules/triage/triage.test.ts`
- Create: `packages/shared/src/schemas/triage.ts`, modify `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `sendTriageMessage` (Task 10).
- Produces: `POST /api/triage/messages` (patient-only), `GET /api/triage/:id` (patient- or doctor-accessible, see ownership note below) — consumed by Task 12 (doctor view) and Task 16's frontend.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/schemas/schemas.test.ts (append)
import { SendTriageMessageInput } from './triage';

describe('SendTriageMessageInput', () => {
  it('requires non-empty text', () => {
    expect(SendTriageMessageInput.safeParse({ text: '' }).success).toBe(false);
  });
  it('accepts text with an optional sessionId', () => {
    expect(SendTriageMessageInput.safeParse({ text: 'itchy patches' }).success).toBe(true);
    expect(SendTriageMessageInput.safeParse({ text: 'itchy patches', sessionId: 'abc' }).success).toBe(true);
  });
});
```

```ts
// apps/api/src/modules/triage/triage.test.ts (append)
describe('POST /api/triage/messages', () => {
  it('starts a new session for an authenticated patient', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'triagepatient@medlink.demo');
    const res = await request(app).post('/api/triage/messages').set('Cookie', cookies).send({ text: 'itchy red patches' });
    expect(res.status).toBe(201);
    expect(res.body.session.messages).toHaveLength(2);
  });

  it('rejects a doctor posting a triage message', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'triagedoc@medlink.demo');
    const res = await request(app).post('/api/triage/messages').set('Cookie', cookies).send({ text: 'test' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/triage/:id', () => {
  it('lets the owning patient fetch their session', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'triagepatient2@medlink.demo');
    const createRes = await request(app).post('/api/triage/messages').set('Cookie', cookies).send({ text: 'itchy patches' });
    const sessionId = createRes.body.session._id;

    const res = await request(app).get(`/api/triage/${sessionId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.session._id).toBe(sessionId);
  });

  it('rejects a different patient reading someone else\'s session', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'triagepatient3@medlink.demo');
    const createRes = await request(app).post('/api/triage/messages').set('Cookie', cookies).send({ text: 'itchy patches' });
    const sessionId = createRes.body.session._id;

    const otherCookies = await registerAndLogin(app, 'patient', 'triagepatient4@medlink.demo');
    const res = await request(app).get(`/api/triage/${sessionId}`).set('Cookie', otherCookies);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- triage.test.ts` and `npm run test --workspace=@medlink/shared`
Expected: FAIL — 404s / missing module

- [ ] **Step 3: Implement the shared schema**

```ts
// packages/shared/src/schemas/triage.ts
import { z } from 'zod';

export const SendTriageMessageInput = z.object({
  text: z.string().min(1),
  sessionId: z.string().optional(),
});
export type SendTriageMessageInput = z.infer<typeof SendTriageMessageInput>;
```

```ts
// packages/shared/src/index.ts (add one line)
export * from './schemas/triage';
```

- [ ] **Step 4: Implement controller and routes**

```ts
// apps/api/src/modules/triage/triage.controller.ts
import { Request, Response, NextFunction } from 'express';
import { sendTriageMessage } from './triage.service';
import { TriageSession } from '../../models/TriageSession';
import { AppError } from '../../lib/errors';

export async function sendTriageMessageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await sendTriageMessage(req.user!.id, req.body.sessionId, req.body.text);
    res.status(201).json({ session });
  } catch (err) {
    next(err);
  }
}

export async function getTriageSessionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await TriageSession.findOne({ _id: req.params.id, patientId: req.user!.id });
    if (!session) throw new AppError(404, 'Triage session not found', 'TRIAGE_SESSION_NOT_FOUND');
    res.status(200).json({ session });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/triage/triage.routes.ts
import { Router } from 'express';
import { SendTriageMessageInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { sendTriageMessageHandler, getTriageSessionHandler } from './triage.controller';

export const triageRouter = Router();

triageRouter.use(requireAuth);
triageRouter.post('/messages', requireRole('patient'), validate(SendTriageMessageInput), sendTriageMessageHandler);
triageRouter.get('/:id', requireRole('patient'), getTriageSessionHandler);
```

Note: `GET /api/triage/:id` is patient-only here (`getTriageSessionHandler`
scopes by `patientId: req.user!.id`) — Task 12 adds a SEPARATE doctor-facing
read path (via the appointment detail response, not this route), since a
doctor should only ever see the triage summary for a session actually linked
to one of their own appointments, not by guessing a session id.

- [ ] **Step 5: Mount the router**

```ts
// apps/api/src/app.ts (modify)
import { triageRouter } from './modules/triage/triage.routes';
// ...
app.use('/api/triage', triageRouter);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test --workspace=apps/api -- triage.test.ts` and `npm run test --workspace=@medlink/shared`
Expected: PASS (all)

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schemas/triage.ts packages/shared/src/index.ts apps/api/src/modules/triage/triage.controller.ts apps/api/src/modules/triage/triage.routes.ts apps/api/src/app.ts apps/api/src/modules/triage/triage.test.ts packages/shared/src/schemas/schemas.test.ts
git commit -m "feat(api): POST /api/triage/messages and GET /api/triage/:id routes"
```

---

### Task 12: `triageSessionId` ownership validation in `createAppointment` (closes a Phase 2 M-12 gap)

**Files:**
- Modify: `apps/api/src/modules/appointments/appointments.service.ts`, `appointments.test.ts`

**Interfaces:**
- Consumes: `TriageSession` model.
- Produces: `createAppointment` now validates `input.triageSessionId` before use — no interface change for callers.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/appointments/appointments.test.ts (append)
import { TriageSession } from '../../models/TriageSession';

describe('POST /api/appointments — triageSessionId ownership', () => {
  it('rejects a triageSessionId that belongs to a different patient', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const otherPatientCookies = await registerAndLogin(app, 'patient', 'otherpatient@medlink.demo');
    const otherPatientRes = await request(app).post('/api/auth/login').send({ email: 'otherpatient@medlink.demo', password: 'longenough1' });
    const otherPatientId = (await request(app).get('/api/patients/me').set('Cookie', otherPatientCookies)).body; // not directly used; session created below instead

    const foreignSession = await TriageSession.create({ patientId: new mongoose.Types.ObjectId() });

    const patientCookies = await registerAndLogin(app, 'patient', 'triageowner@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const res = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slotsRes.body.slots[0].start, slotEnd: slotsRes.body.slots[0].end,
      triageSessionId: foreignSession._id.toString(),
    });

    expect(res.status).toBe(403);
  });

  it('accepts a triageSessionId that belongs to the booking patient and copies its symptom summary', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'triageowner2@medlink.demo');
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'triageowner2@medlink.demo', password: 'longenough1' });
    void loginRes;

    const meResponse = await request(app).post('/api/triage/messages').set('Cookie', patientCookies).send({ text: 'itchy patches' });
    const session = await TriageSession.findByIdAndUpdate(
      meResponse.body.session._id,
      { extractedSymptoms: ['itchy patches on elbow'] },
      { new: true }
    );

    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const res = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slotsRes.body.slots[0].start, slotEnd: slotsRes.body.slots[0].end,
      triageSessionId: session!._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.appointment.triageSessionId).toBe(session!._id.toString());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- appointments.test.ts`
Expected: FAIL — the first test currently gets 201 (no ownership check exists yet)

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/appointments/appointments.service.ts (modify createAppointment)
import { TriageSession } from '../../models/TriageSession';

// Add this check right after the doctor-approval check, before the slot
// availability check:
if (input.triageSessionId) {
  const session = await TriageSession.findOne({ _id: input.triageSessionId, patientId });
  if (!session) {
    throw new AppError(403, 'Triage session does not belong to this patient', 'TRIAGE_SESSION_FORBIDDEN');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- appointments.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/appointments/appointments.service.ts apps/api/src/modules/appointments/appointments.test.ts
git commit -m "fix(api): validate triageSessionId ownership in createAppointment"
```

---

### Task 13: Doctor sees the symptom summary on the appointment request card

**Files:**
- Modify: `apps/api/src/modules/appointments/appointments.controller.ts`, `appointments.test.ts`

**Interfaces:**
- Consumes: `TriageSession` model.
- Produces: `GET /api/appointments/me` (doctor view) now includes a populated `triageSummary` field per appointment — consumed by Task 17's doctor dashboard.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/appointments/appointments.test.ts (append)
describe('GET /api/appointments/me — doctor sees triage summary', () => {
  it('includes the linked triage session\'s extracted symptoms for the doctor', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'triagesummary@medlink.demo');

    const triageRes = await request(app).post('/api/triage/messages').set('Cookie', patientCookies).send({ text: 'itchy patches' });
    await TriageSession.findByIdAndUpdate(triageRes.body.session._id, { extractedSymptoms: ['itchy patches', 'redness'] });

    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slotsRes.body.slots[0].start, slotEnd: slotsRes.body.slots[0].end,
      triageSessionId: triageRes.body.session._id,
    });

    const res = await request(app).get('/api/appointments/me').set('Cookie', docCookies);
    expect(res.status).toBe(200);
    expect(res.body.items[0].triageSummary).toEqual(['itchy patches', 'redness']);
  });

  it('has a null triageSummary for an appointment with no linked triage session', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'notriagesummary@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slotsRes.body.slots[0].start, slotEnd: slotsRes.body.slots[0].end,
    });

    const res = await request(app).get('/api/appointments/me').set('Cookie', docCookies);
    expect(res.body.items[0].triageSummary).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- appointments.test.ts`
Expected: FAIL — `triageSummary` is `undefined`, not present

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/appointments/appointments.controller.ts (modify listMyAppointments)
import { TriageSession } from '../../models/TriageSession';

// After fetching `items` (the Appointment documents) and before the res.json call:
const itemsWithTriageSummary = await Promise.all(
  items.map(async (item) => {
    const plain = item.toObject();
    if (!item.triageSessionId) {
      return { ...plain, triageSummary: null };
    }
    const session = await TriageSession.findById(item.triageSessionId);
    return { ...plain, triageSummary: session?.extractedSymptoms ?? null };
  })
);

res.status(200).json({ items: itemsWithTriageSummary, total, page, limit });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- appointments.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/appointments/appointments.controller.ts apps/api/src/modules/appointments/appointments.test.ts
git commit -m "feat(api): surface linked triage symptom summary in the doctor's appointment list"
```

---

### Task 14: RTK Query triage API slice

**Files:**
- Create: `apps/web/src/store/triageApi.ts`

**Interfaces:**
- Consumes: `baseApi` (Phase 1).
- Produces: `useSendTriageMessageMutation`, `useGetTriageSessionQuery` — consumed by Task 15.

- [ ] **Step 1: Implement the API slice**

```ts
// apps/web/src/store/triageApi.ts
import { baseApi } from './api';

export interface TriageMessage { role: 'user' | 'assistant'; text: string; at: string }
export interface SpecialtySuggestion { name: string; confidence: number }
export interface TriageSession {
  _id: string;
  messages: TriageMessage[];
  extractedSymptoms: string[];
  suggestedSpecialties: SpecialtySuggestion[];
  recommendedDoctorIds: string[];
  isRedFlag: boolean;
  disclaimerShownAt: string;
}

export const triageApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    sendTriageMessage: builder.mutation<{ session: TriageSession }, { text: string; sessionId?: string }>({
      query: (body) => ({ url: '/triage/messages', method: 'POST', body }),
    }),
    getTriageSession: builder.query<{ session: TriageSession }, string>({
      query: (id) => `/triage/${id}`,
    }),
  }),
});

export const { useSendTriageMessageMutation, useGetTriageSessionQuery } = triageApi;
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/store/triageApi.ts
git commit -m "feat(web): RTK Query endpoints for the triage chat"
```

---

### Task 15: Triage chat UI

**Files:**
- Create: `apps/web/src/app/triage/page.tsx`

**Interfaces:**
- Consumes: `useSendTriageMessageMutation` (Task 14).
- Produces: nothing consumed elsewhere in this plan except by being the page Task 16 extends.

- [ ] **Step 1: Implement the chat page**

```tsx
// apps/web/src/app/triage/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSendTriageMessageMutation } from '@/store/triageApi';
import type { TriageSession } from '@/store/triageApi';

export default function TriagePage() {
  const [input, setInput] = useState('');
  const [session, setSession] = useState<TriageSession | null>(null);
  const [sendMessage, { isLoading }] = useSendTriageMessageMutation();

  async function onSend() {
    if (!input.trim()) return;
    const { session: updated } = await sendMessage({ text: input, sessionId: session?._id }).unwrap();
    setSession(updated);
    setInput('');
  }

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Describe your symptoms</h1>
      <p className="text-sm text-gray-600">This is guidance, not medical advice.</p>

      <div className="space-y-2">
        {session?.messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <p className={`inline-block px-3 py-2 rounded ${m.role === 'user' ? 'bg-black text-white' : 'bg-gray-100'}`}>
              {m.text}
            </p>
          </div>
        ))}
      </div>

      {session?.isRedFlag ? (
        <div className="bg-red-600 text-white p-4 rounded font-bold">
          This may be a medical emergency. Seek emergency care immediately or call 112.
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              className="border p-2 flex-1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSend()}
              placeholder="e.g. itchy red patches on my elbow for 2 weeks"
            />
            <button className="bg-black text-white px-4 py-2" disabled={isLoading} onClick={onSend}>
              Send
            </button>
          </div>

          {session && session.suggestedSpecialties.length > 0 ? (
            <div className="space-y-2">
              <h2 className="font-semibold">Suggested specialties</h2>
              {session.suggestedSpecialties.map((s) => (
                <div key={s.name} className="border p-3 rounded flex justify-between items-center">
                  <span>{s.name} ({Math.round(s.confidence * 100)}% match)</span>
                </div>
              ))}
              <div className="space-y-1">
                {session.recommendedDoctorIds.map((doctorId) => (
                  <Link
                    key={doctorId}
                    className="block underline"
                    href={`/doctors/${doctorId}/book?triageSessionId=${session._id}`}
                  >
                    Book with this doctor →
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/triage
git commit -m "feat(web): triage chat UI with emergency banner and doctor deep-links"
```

---

### Task 16: Carry `triageSessionId` through the booking page

**Files:**
- Modify: `apps/web/src/app/doctors/[id]/book/page.tsx`

**Interfaces:**
- Consumes: a `triageSessionId` query param (from Task 15's deep link).
- Produces: `POST /appointments` calls now include `triageSessionId` when present.

- [ ] **Step 1: Read the query param and thread it through**

```tsx
// apps/web/src/app/doctors/[id]/book/page.tsx (modify)
'use client';

import { use, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useGetDoctorSlotsQuery, useCreateAppointmentMutation } from '@/store/appointmentsApi';

export default function BookAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: doctorId } = use(params);
  const searchParams = useSearchParams();
  const triageSessionId = searchParams.get('triageSessionId') ?? undefined;
  const { data, isLoading } = useGetDoctorSlotsQuery({ doctorId, days: 14 });
  const [createAppointment, { isLoading: isBooking, error }] = useCreateAppointmentMutation();
  const [selected, setSelected] = useState<{ start: string; end: string } | null>(null);
  const router = useRouter();

  async function onBook() {
    if (!selected) return;
    try {
      await createAppointment({ doctorId, slotStart: selected.start, slotEnd: selected.end, triageSessionId }).unwrap();
      router.push('/dashboard/patient');
    } catch {
      // error state below already reflects the failure
    }
  }

  // ...rest of the component unchanged (slot grid, book button, error message)...
}
```

Note: this requires `useCreateAppointmentMutation`'s request type (Task 16 of
Phase 2, `apps/web/src/store/appointmentsApi.ts`) to accept an optional
`triageSessionId` field — check its current type and widen it if it doesn't
already (it likely doesn't, since Phase 2 predates this field's frontend use).

- [ ] **Step 2: Widen the RTK Query mutation type if needed**

```ts
// apps/web/src/store/appointmentsApi.ts (modify, if the type doesn't already include it)
createAppointment: builder.mutation<{ appointment: Appointment }, { doctorId: string; slotStart: string; slotEnd: string; triageSessionId?: string }>({
  query: (body) => ({ url: '/appointments', method: 'POST', body }),
  invalidatesTags: ['MyAppointments'],
}),
```

- [ ] **Step 3: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/doctors/[id]/book/page.tsx apps/web/src/store/appointmentsApi.ts
git commit -m "feat(web): carry triageSessionId from the chat into the booking flow"
```

---

### Task 17: Doctor dashboard shows the triage symptom summary

**Files:**
- Modify: `apps/web/src/app/dashboard/doctor/page.tsx`

**Interfaces:**
- Consumes: `triageSummary` field (Task 13) already present in `useListMyAppointmentsQuery`'s response.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Render the summary on each request card**

```tsx
// apps/web/src/app/dashboard/doctor/page.tsx (modify the card markup)
{data?.items.map((appt) => (
  <div key={appt._id} className="border p-3 rounded flex justify-between items-center">
    <div>
      <p>{new Date(appt.slotStart).toLocaleString()}</p>
      {appt.triageSummary && appt.triageSummary.length > 0 ? (
        <p className="text-sm text-gray-600">Symptoms: {appt.triageSummary.join(', ')}</p>
      ) : null}
    </div>
    <div className="space-x-2">
      {/* existing confirm/reject buttons unchanged */}
    </div>
  </div>
))}
```

Note: this requires `Appointment` (the RTK Query type in
`apps/web/src/store/appointmentsApi.ts`) to include an optional
`triageSummary: string[] | null` field — add it if missing.

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/doctor/page.tsx apps/web/src/store/appointmentsApi.ts
git commit -m "feat(web): show the patient's symptom summary on the doctor's request card"
```

---

### Task 18: Phase 3 seed data (4 triage sessions)

**Files:**
- Modify: `apps/api/src/seed/seed.ts`
- Test: extend `apps/api/src/seed/seed.test.ts`

**Interfaces:**
- Consumes: `TriageSession` model, existing seeded appointments (Phase 2 Task 15).
- Produces: the 4-triage-session slice of CLAUDE.md §6.4, per the roadmap's phase-by-phase seeding table.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/seed/seed.test.ts (append)
import { TriageSession } from '../models/TriageSession';

describe('runSeed — Phase 3 slice', () => {
  it('seeds exactly 4 triage sessions, one of which is a red-flag case with no linked appointment', async () => {
    await runSeed();
    const sessions = await TriageSession.find({});
    expect(sessions).toHaveLength(4);

    const redFlagSessions = sessions.filter((s) => s.isRedFlag);
    expect(redFlagSessions).toHaveLength(1);

    const linkedCount = await Appointment.countDocuments({ triageSessionId: { $ne: null } });
    expect(linkedCount).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- seed.test.ts`
Expected: FAIL — 0 triage sessions

- [ ] **Step 3: Implement**

```ts
// apps/api/src/seed/seed.ts (modify — add after the appointment-seeding block)
import { TriageSession } from '../models/TriageSession';

// ...inside runSeed():
await TriageSession.deleteMany({});

const rashSession = await TriageSession.create({
  patientId: patientUsers[0]!._id,
  messages: [
    { role: 'user', text: 'itchy red patches on my elbow for 2 weeks', at: daysAgo(3) },
    { role: 'assistant', text: 'How long have you had these symptoms?', at: daysAgo(3) },
    { role: 'user', text: '2 weeks', at: daysAgo(3) },
    { role: 'assistant', text: 'How severe is it — mild, moderate, or severe?', at: daysAgo(3) },
    { role: 'user', text: 'mild', at: daysAgo(3) },
    { role: 'assistant', text: 'Based on what you\'ve described, you may want to see: Dermatology. This is guidance, not medical advice.', at: daysAgo(3) },
  ],
  extractedSymptoms: ['itchy red patches', 'elbow'],
  suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.87 }],
  recommendedDoctorIds: [meera.profileId],
  isRedFlag: false,
  disclaimerShownAt: daysAgo(3),
});

const acidityCases = await TriageSession.create({
  patientId: patientUsers[1]!._id,
  messages: [{ role: 'user', text: 'acidity and heartburn after meals', at: daysAgo(4) }],
  extractedSymptoms: ['acidity', 'heartburn'],
  suggestedSpecialties: [{ name: 'Gastroenterology', confidence: 0.81 }],
  recommendedDoctorIds: [],
  isRedFlag: false,
  disclaimerShownAt: daysAgo(4),
});
void acidityCases;

const kneeSession = await TriageSession.create({
  patientId: patientUsers[2]!._id,
  messages: [{ role: 'user', text: 'knee pain when walking up stairs', at: daysAgo(6) }],
  extractedSymptoms: ['knee pain'],
  suggestedSpecialties: [{ name: 'Orthopedics', confidence: 0.79 }],
  recommendedDoctorIds: [],
  isRedFlag: false,
  disclaimerShownAt: daysAgo(6),
});
void kneeSession;

await TriageSession.create({
  patientId: patientUsers[3]!._id,
  messages: [
    { role: 'user', text: 'crushing chest pain radiating to my arm', at: daysAgo(1) },
    { role: 'assistant', text: 'This may be a medical emergency. Seek emergency care immediately or call 112.', at: daysAgo(1) },
  ],
  extractedSymptoms: [],
  suggestedSpecialties: [],
  recommendedDoctorIds: [],
  isRedFlag: true,
  disclaimerShownAt: daysAgo(1),
});

// Link 2 of the sessions to already-seeded completed appointments (Phase 2's
// appointmentSeeds), per CLAUDE.md §6.4: "Link 2 of them to the completed
// appointments via triageSessionId".
const meeraCompletedAppointment = await Appointment.findOne({ doctorId: meera.profileId, status: 'completed' }).sort({ slotStart: -1 });
if (meeraCompletedAppointment) {
  meeraCompletedAppointment.triageSessionId = rashSession._id;
  await meeraCompletedAppointment.save();
}
```

Adjust the second linked session (the plan's own `2026-07-27-phase2-booking.md`
seed data doesn't name every completed appointment's doctor explicitly enough
to script a second link mechanically here) — pick any other seeded completed
appointment and link the Gastroenterology or Orthopedics session to it,
following the same `findOne(...).save()` pattern shown above.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- seed.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/seed
git commit -m "feat(api): seed Phase 3's 4 demo triage sessions"
```

---

## Phase 3 Definition of Done (from CLAUDE.md §2)

"I have itchy red patches on my elbow for 2 weeks" (after the two clarifying
answers) → Dermatology (~0.87) → 3 bookable dermatologists. "Crushing chest
pain" → emergency banner immediately, no specialty matching, no clarifying
questions.

## Self-Review Notes

- **Spec coverage:** every Phase 3 CLAUDE.md §2 checklist item maps to a
  task: FastAPI scaffold → Task 1; red-flag layer → Task 2; specialty map →
  Task 3; embedding engine → Task 4; `/triage` endpoint → Task 5; 50-case
  fixture + accuracy gate → Task 6; chat UI → Task 15; "book with Dr. X" deep
  link → Tasks 15-16; Node→FastAPI proxy with timeout + circuit breaker →
  Task 8; Redis caching → Task 9; disclaimer + `disclaimerShownAt` → Task 10.
- **Roadmap carry-forwards closed:** `TriageSession.isRedFlag` (Task 7) and
  `createAppointment`'s `triageSessionId` ownership gap (Task 12) — both
  flagged by Phase 2's final review, both addressed here rather than
  retrofitted into Phase 2.
- **Known limitation, intentionally scoped (see "Scope decisions"):** no true
  NLP span extraction, no dynamically-generated clarifying questions — both
  are fixed, deterministic, and testable rather than attempting an LLM
  integration this stack doesn't have.
- **Type consistency check:** `AITriageResult` (Task 8, Node) and
  `TriageResponse` (Task 5, Python/pydantic) are independently-defined but
  intentionally shape-matched field-for-field (`emergency`, `message`,
  `extractedSymptoms`, `suggestedSpecialties: {name, confidence}[]`) — if a
  field is ever added to one, add it to the other, since nothing enforces
  this pairing automatically (deliberately not shared, per CLAUDE.md §3: "AI
  service... mirrors with pydantic" describes two contracts kept in sync by
  convention, not one generated contract).
