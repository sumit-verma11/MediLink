import json
import os
import tempfile

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
