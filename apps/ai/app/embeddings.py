import json
from typing import Any, cast

import numpy as np
from sentence_transformers import SentenceTransformer


def _cosine_similarity(a: np.ndarray[Any, Any], b: np.ndarray[Any, Any]) -> float:
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
        self._centroids: list[np.ndarray[Any, Any]] = []

        for name in self._specialty_names:
            phrase_embeddings = self._model.encode(specialty_map[name])
            centroid = np.mean(phrase_embeddings, axis=0)
            self._centroids.append(centroid)

    def match(self, text: str, top_k: int = 3) -> list[tuple[str, float]]:
        query_embedding = cast("np.ndarray[Any, Any]", self._model.encode(text))
        scored = [
            (name, _cosine_similarity(query_embedding, centroid))
            for name, centroid in zip(self._specialty_names, self._centroids)
        ]
        scored.sort(key=lambda pair: pair[1], reverse=True)
        return scored[:top_k]
