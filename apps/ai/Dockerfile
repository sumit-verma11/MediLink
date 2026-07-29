FROM python:3.12-slim
WORKDIR /app
COPY apps/ai/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Bake the sentence-transformers model into the image layer at build time so
# container startup needs no network access and cold starts stay fast
# (CLAUDE.md §4 risk: "Model download size in Docker" -> bake + layer-cache).
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
COPY apps/ai/app ./app
COPY apps/ai/specialty_map.json ./specialty_map.json
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
