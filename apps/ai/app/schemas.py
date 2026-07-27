from typing import Optional

from pydantic import BaseModel, Field


class TriageRequest(BaseModel):
    text: str = Field(min_length=1)


class SpecialtySuggestion(BaseModel):
    name: str
    confidence: float


class TriageResponse(BaseModel):
    emergency: bool
    # NOTE: `Optional[str]` (not `str | None`) is deliberate here, not a style
    # choice — pydantic v2 resolves model field annotations at class-definition
    # time via a real eval of the annotation, which requires `type.__or__`
    # (Python 3.10+). This repo's local dev venv runs 3.9.6 (see apps/ai
    # README/CLAUDE.md note on the 3.9/3.12 CI discrepancy), so `str | None`
    # here would crash on import even though ruff/mypy (targeting py312) would
    # happily accept it. Plain function annotations elsewhere (e.g.
    # app/red_flags.py) don't have this problem since nothing evaluates them
    # at runtime; pydantic BaseModel fields are the exception.
    message: Optional[str] = None  # noqa: UP007 -- see note above; str | None breaks on py3.9 at runtime
    extractedSymptoms: list[str] = []
    suggestedSpecialties: list[SpecialtySuggestion] = []
