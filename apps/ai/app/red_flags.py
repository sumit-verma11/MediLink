from __future__ import annotations

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
