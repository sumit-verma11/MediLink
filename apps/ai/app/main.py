from fastapi import FastAPI

app = FastAPI(title="MedLink AI Triage Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
