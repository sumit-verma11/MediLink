import json
import os
import tempfile

from app.embeddings import SpecialtyMatcher
from app.red_flags import check_red_flag


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


def test_fixture_accuracy_meets_target():
    """Runs the full apps/ai/specialty_map.json (not the small test map above)
    against the 50-case fixture set. Target: >=90% top-3 hit rate on
    non-emergency cases, and 100% correct emergency detection."""
    fixtures_path = os.path.join(os.path.dirname(__file__), "fixtures", "triage_cases.json")
    with open(fixtures_path) as f:
        cases = json.load(f)

    real_map_path = os.path.join(os.path.dirname(__file__), "..", "specialty_map.json")
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
    total = len(specialty_cases)
    assert accuracy >= 0.90, f"top-3 accuracy {accuracy:.2%} below 90% target ({hits}/{total})"
