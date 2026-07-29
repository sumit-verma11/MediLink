import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    # Must enter as a context manager: with the installed Starlette version
    # (0.38.6), a bare `TestClient(app)` never runs the `lifespan` startup —
    # only `__enter__`/`__exit__` do — so `app.state.specialty_matcher` would
    # never get set and every non-red-flag request would 500.
    with TestClient(app) as c:
        yield c


def test_red_flag_short_circuits_before_matching(client: TestClient) -> None:
    response = client.post("/triage", json={"text": "I have crushing chest pain"})
    assert response.status_code == 200
    body = response.json()
    assert body["emergency"] is True
    assert body["suggestedSpecialties"] == []
    assert "seek emergency care" in body["message"].lower() or "112" in body["message"]


def test_ordinary_symptom_returns_top_3_specialties(client: TestClient) -> None:
    response = client.post("/triage", json={"text": "itchy red patches on my elbow for 2 weeks"})
    assert response.status_code == 200
    body = response.json()
    assert body["emergency"] is False
    assert len(body["suggestedSpecialties"]) == 3
    assert body["suggestedSpecialties"][0]["name"] == "Dermatology"
    assert 0.0 <= body["suggestedSpecialties"][0]["confidence"] <= 1.0


def test_extracts_symptom_phrases(client: TestClient) -> None:
    response = client.post("/triage", json={"text": "itchy patches, and mild fever"})
    body = response.json()
    assert len(body["extractedSymptoms"]) >= 1


def test_rejects_empty_text(client: TestClient) -> None:
    response = client.post("/triage", json={"text": ""})
    assert response.status_code == 422
