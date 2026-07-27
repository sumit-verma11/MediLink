from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.embeddings import SpecialtyMatcher
from app.routes.triage import router as triage_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Load the model and precompute specialty centroids exactly once, at
    # startup — not per-request. This is the expensive step (~seconds).
    app.state.specialty_matcher = SpecialtyMatcher(settings.specialty_map_path, settings.model_name)
    yield


app = FastAPI(title="MedLink AI Triage Service", lifespan=lifespan)
app.include_router(triage_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
