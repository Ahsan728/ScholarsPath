# browser-fetch (Cloud Run service)

Renders JS-heavy pages with headless Chromium so the ScholarsPath
Discoverer can extract opportunities from sites like EURAXESS, Findaphd,
ScholarshipPortal, CERN, EMBL.

## What it does

POST `/fetch` with a JSON body:

```json
{ "url": "https://euraxess.ec.europa.eu/jobs" }
```

Returns:

```json
{
  "html": "<!doctype html>...",
  "status": 200,
  "final_url": "...",
  "error": null
}
```

Requires `Authorization: Bearer <FETCH_AUTH_TOKEN>` header on every
request.

## Deploy (first time)

```bash
# 1. Pick a strong shared secret for the Discoverer ⇄ service handshake.
#    Generate one e.g. via `openssl rand -hex 24`. Keep it in 1Password.
export FETCH_AUTH_TOKEN=$(openssl rand -hex 24)

# 2. Set project and region.
gcloud config set project scholarspath
gcloud config set run/region europe-west1

# 3. Deploy. This builds the Docker image, pushes to Artifact Registry,
#    and creates the Cloud Run service. First run takes ~5 min.
cd cloud-run-fetch
gcloud run deploy browser-fetch \
  --source . \
  --memory 2Gi \
  --cpu 2 \
  --timeout 60 \
  --max-instances 2 \
  --no-allow-unauthenticated \
  --set-env-vars "FETCH_AUTH_TOKEN=${FETCH_AUTH_TOKEN}"

# 4. Grab the URL. Save it in scholarspath/.env.local:
gcloud run services describe browser-fetch \
  --format='value(status.url)'
```

Then in `.env.local`:

```
BROWSER_FETCH_URL=https://browser-fetch-xxxxx-ew.a.run.app
BROWSER_FETCH_TOKEN=<the FETCH_AUTH_TOKEN you generated>
```

## Smoke test

```bash
curl -X POST "${BROWSER_FETCH_URL}/fetch" \
  -H "Authorization: Bearer ${BROWSER_FETCH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://euraxess.ec.europa.eu/jobs"}' \
  | python -c "import json,sys; d=json.load(sys.stdin); print('status', d['status'], 'html chars', len(d['html']))"
```

Expected: `status 200 html chars 100000+`.

## Update later

```bash
cd cloud-run-fetch
gcloud run deploy browser-fetch --source .
```

Cloud Run handles zero-downtime rollout. The new image is built and
deployed; the old one keeps serving until the new one is healthy.

## Cost ceiling

Steady-state monthly cost (worst case): **$0** under Cloud Run's Always
Free tier. The $5/month billing alert in Google Cloud Console will email
you long before this exits free tier.

Hard caps inside the code:
- `wait_ms` clamped to 5,000 ms
- `max_html_chars` defaults to 500,000 (the caller can request less, not
  more)
- `page.set_default_timeout(30_000)` — single fetch can't burn more than
  ~30 vCPU-seconds.
