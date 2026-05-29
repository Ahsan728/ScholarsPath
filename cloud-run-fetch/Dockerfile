# Cloud Run Playwright service for ScholarsPath Phase 1B.
#
# Exposes one HTTP endpoint: POST /fetch { "url": "..." }
# Returns the rendered HTML after JS execution. Used by the
# Discoverer when opportunity_sources.js_render = true.
#
# Build & deploy:
#   cd cloud-run-fetch
#   gcloud run deploy browser-fetch \
#     --source . \
#     --region europe-west1 \
#     --memory 2Gi --cpu 2 --timeout 60 \
#     --max-instances 2 \
#     --allow-unauthenticated=false \
#     --set-env-vars FETCH_AUTH_TOKEN=<random-secret>

# Microsoft's Playwright image already has Chromium + all its deps.
# Pinning the version means Chromium updates are explicit, not surprise.
FROM mcr.microsoft.com/playwright/python:v1.49.1-noble

WORKDIR /app

# Install Python deps. uvicorn = ASGI server, fastapi = web framework.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY browser_fetch.py .

# Cloud Run requires the container to listen on $PORT (default 8080).
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn browser_fetch:app --host 0.0.0.0 --port ${PORT}"]
