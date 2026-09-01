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

# Devanagari + common Latin-transliterated variants, one or more per English
# concept above. AUTHOR/REVIEW NOTE: these must be reviewed by a fluent Hindi
# speaker (or clinically-informed reviewer) before this is trusted in any real
# deployment -- see the design spec's "highest-stakes part of this feature"
# note. Written from natural colloquial phrasing, not a dictionary
# translation, but not a substitute for native-speaker sign-off.
RED_FLAG_KEYWORDS_HI: list[str] = [
    "सीने में दर्द", "सीने में तेज दर्द", "seene mein dard", "seene mein tez dard", "chest mein dard",
    "सांस लेने में तकलीफ", "saans lene mein takleef", "saans lene mein bahut takleef", "saans phoolna",
    "आत्महत्या", "khudkushi", "aatmahatya", "khud ko nuksan",
    "बहुत खून बह रहा", "bahut khoon beh raha hai", "khoon nahi ruk raha",
    "अचानक दिखना बंद", "achanak dikhna band ho gaya", "achanak roshni chali gayi",
    "बेहोश", "behosh", "behoshi",
    "दौरा पड़ना", "daura padna", "mirgi ka daura",
    "लकवा", "lakwa", "chehra tedha ho gaya", "बोलने में लड़खड़ाहट",
    "पेट में तेज दर्द", "pet mein bahut tez dard",
]


def check_red_flag(text: str, language: str = "en") -> str | None:
    """Return the matched keyword if `text` contains a red-flag phrase in the
    given language, else None.

    This must run before any embedding-based matching — a red-flag match skips
    specialty matching entirely and routes straight to an emergency response.
    """
    keywords = RED_FLAG_KEYWORDS_HI if language == "hi" else RED_FLAG_KEYWORDS
    normalized = text.lower()
    for keyword in keywords:
        if keyword.lower() in normalized:
            return keyword
    return None
