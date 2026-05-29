"""Cloud Run service that returns JS-rendered HTML for a given URL.

Single endpoint: POST /fetch { "url": "..." } -> { "html": "...", "status": 200 }

Auth: caller must send header `Authorization: Bearer <FETCH_AUTH_TOKEN>`
matching the env var set on the Cloud Run service. Without this anyone
on the internet could DoS the service.

Browser strategy:
- Launches Chromium headless once per request (Cloud Run scales to zero
  between requests, so a long-lived browser doesn't survive anyway).
- Waits for `networkidle` (no network activity for 500ms) with a 30s
  cap. Tunable via the request body.
- Strips obvious cookie/consent overlays by clicking common "accept"
  buttons before snapshot.
"""

import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, HttpUrl
from playwright.async_api import async_playwright

app = FastAPI()

AUTH_TOKEN = os.environ.get("FETCH_AUTH_TOKEN", "")

# Common cookie-banner accept selectors. The list is intentionally short;
# adding more makes each fetch slower for unclear value.
COOKIE_BUTTONS = [
    "button:has-text('Accept all')",
    "button:has-text('Accept All')",
    "button:has-text('Allow all')",
    "button:has-text('I accept')",
    "button:has-text('Got it')",
    "button#onetrust-accept-btn-handler",
    "button[aria-label*='accept' i]",
]


class FetchRequest(BaseModel):
    url: HttpUrl
    wait_ms: int = 1500          # extra wait after networkidle
    max_html_chars: int = 500_000


class FetchResponse(BaseModel):
    html: str
    status: int
    final_url: str
    error: str | None = None


def check_auth(authorization: str | None) -> None:
    if not AUTH_TOKEN:
        # If no token configured, refuse all requests — fail closed.
        raise HTTPException(503, "FETCH_AUTH_TOKEN not configured on server")
    expected = f"Bearer {AUTH_TOKEN}"
    if authorization != expected:
        raise HTTPException(401, "Unauthorized")


@app.get("/healthz")
def health():
    return {"ok": True}


@app.post("/fetch", response_model=FetchResponse)
async def fetch(req: FetchRequest, authorization: str | None = Header(default=None)):
    check_auth(authorization)

    url = str(req.url)
    final_url = url
    status = 0
    error: str | None = None
    html = ""

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            try:
                context = await browser.new_context(
                    user_agent=(
                        "Mozilla/5.0 (compatible; ScholarAssistBot/1.0; "
                        "+https://scholars.ahsansuny.com)"
                    ),
                    viewport={"width": 1280, "height": 900},
                    locale="en-US",
                )
                page = await context.new_page()

                # Reasonable defaults; the request body can't override them
                # to keep abuse bounded.
                page.set_default_timeout(30_000)
                response = await page.goto(
                    url,
                    wait_until="networkidle",
                    timeout=30_000,
                )

                if response is not None:
                    status = response.status
                    final_url = response.url

                # Dismiss obvious cookie consent banners — many EU sites
                # hide content behind them.
                for sel in COOKIE_BUTTONS:
                    try:
                        btn = await page.wait_for_selector(sel, timeout=600)
                        if btn:
                            await btn.click(timeout=600)
                            await page.wait_for_load_state("networkidle", timeout=5_000)
                            break
                    except Exception:
                        continue

                # Extra wait for late JS/AJAX.
                wait_ms = max(0, min(req.wait_ms, 5_000))
                if wait_ms:
                    await page.wait_for_timeout(wait_ms)

                html = await page.content()
                html = html[: req.max_html_chars]
            finally:
                await browser.close()
    except Exception as e:
        error = str(e)[:500]
        if status == 0:
            status = 599  # synthetic: client-side failure (timeout, navigation error)

    return FetchResponse(html=html, status=status, final_url=final_url, error=error)
