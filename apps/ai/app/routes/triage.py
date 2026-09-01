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
    matched_keyword = check_red_flag(payload.text, payload.language)
    if matched_keyword is not None:
        emergency_message = (
            "यह एक चिकित्सीय आपातकाल हो सकता है। तुरंत आपातकालीन देखभाल लें या 112 पर कॉल करें।"
            if payload.language == "hi"
            else "This may be a medical emergency. Seek emergency care immediately or call 112."
        )
        return TriageResponse(
            emergency=True,
            message=emergency_message,
            extractedSymptoms=[],
            suggestedSpecialties=[],
        )

    matcher = request.app.state.specialty_matcher
    matches = matcher.match(payload.text, top_k=3)

    return TriageResponse(
        emergency=False,
        message=None,
        extractedSymptoms=_extract_symptoms(payload.text),
        suggestedSpecialties=[
            SpecialtySuggestion(name=name, confidence=round(score, 4)) for name, score in matches
        ],
    )
