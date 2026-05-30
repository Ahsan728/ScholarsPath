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
    # If set, after navigation Playwright will wait up to `wait_selector_ms`
    # for at least one matching element to appear. Lets SPAs finish their
    # initial XHR before we snapshot.
    wait_selector: str | None = None
    wait_selector_ms: int = 15_000
    # If set, after waiting Playwright will scroll the page to trigger
    # lazy-loading or infinite scroll. Number of full-viewport scrolls.
    scroll_count: int = 0
    # Click-pagination: after the initial render, click `click_selector`
    # up to `click_loop_max` times, waiting `click_wait_ms` between each
    # click. After all clicks, snapshot the final DOM. Used for Campus
    # France DataTables, EURAXESS "load more" patterns, etc.
    click_selector: str | None = None
    click_loop_max: int = 0
    click_wait_ms: int = 1500
    # When true, snapshot the DOM BEFORE each click and concatenate all
    # snapshots into the returned HTML (separated by '<!-- PAGE BREAK -->').
    # Use for sources whose "Next" button REPLACES rows (Campus France
    # PhD Calls/Offers, EURAXESS jobs) so each visited page's content
    # is preserved.
    collect_pages: bool = False
    # Change a <select> dropdown value before snapshot. Useful for
    # "rows per page" controls. Format: "selector|value".
    # Example: 'select[name="maintable_length"]|-1'
    select_value: str | None = None
    select_wait_ms: int = 2500
    max_html_chars: int = 1_500_000


class FetchResponse(BaseModel):
    html: str
    status: int
    final_url: str
    error: str | None = None
    clicks_done: int = 0


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

                # If caller specified a selector to wait for (e.g. ".job-item"),
                # block until at least one appears or we time out. This is how
                # we handle heavy SPAs (EURAXESS, Campus France catalogs)
                # whose initial HTML is just an empty mount point.
                if req.wait_selector:
                    try:
                        await page.wait_for_selector(
                            req.wait_selector,
                            timeout=min(max(req.wait_selector_ms, 1_000), 30_000),
                        )
                    except Exception:
                        # Not finding the selector isn't fatal; we still
                        # return whatever rendered so the caller can decide.
                        pass

                # Extra wait for late JS/AJAX.
                wait_ms = max(0, min(req.wait_ms, 15_000))
                if wait_ms:
                    await page.wait_for_timeout(wait_ms)

                # Change a <select> value (e.g. rows-per-page dropdown)
                # before clicks/scrolls. select_value is "selector|value".
                if req.select_value and "|" in req.select_value:
                    sel, val = req.select_value.split("|", 1)
                    try:
                        await page.select_option(sel.strip(), val.strip())
                        await page.wait_for_timeout(
                            max(500, min(int(req.select_wait_ms), 8_000))
                        )
                    except Exception:
                        pass

                # Scroll to trigger lazy-loaded content (infinite scroll
                # patterns common on catalog UIs). Capped to keep the
                # function under Cloud Run's 60s timeout.
                scroll_count = max(0, min(req.scroll_count, 20))
                for _ in range(scroll_count):
                    await page.evaluate("window.scrollBy(0, window.innerHeight)")
                    await page.wait_for_timeout(700)

                # Click-pagination loop: click the given selector up to
                # click_loop_max times, waiting click_wait_ms between
                # each. Stops early if the selector disappears (button
                # was hidden/disabled because we hit the last page) or
                # if the click itself errors. Capped at 50 clicks total
                # to stay under Cloud Run's 60s timeout.
                #
                # When collect_pages=true, snapshot DOM before each click
                # (and after the final click) and concatenate. Use for
                # "Next" buttons that replace rows.
                clicks_done = 0
                page_snapshots: list[str] = []
                if req.click_selector and req.click_loop_max > 0:
                    cap = min(int(req.click_loop_max), 50)
                    wait_ms_click = max(500, min(int(req.click_wait_ms), 5_000))
                    if req.collect_pages:
                        page_snapshots.append(await page.content())
                    for _ in range(cap):
                        try:
                            btn = await page.query_selector(req.click_selector)
                            if not btn:
                                break
                            # Skip if disabled / hidden — we've reached the last page
                            try:
                                is_disabled = await btn.get_attribute("disabled")
                                if is_disabled is not None:
                                    break
                                is_visible = await btn.is_visible()
                                if not is_visible:
                                    break
                            except Exception:
                                pass
                            await btn.click(timeout=3_000)
                            await page.wait_for_timeout(wait_ms_click)
                            clicks_done += 1
                            if req.collect_pages:
                                page_snapshots.append(await page.content())
                        except Exception:
                            break

                if req.collect_pages and page_snapshots:
                    html = "\n<!-- PAGE BREAK -->\n".join(page_snapshots)
                else:
                    html = await page.content()
                html = html[: req.max_html_chars]
            finally:
                await browser.close()
    except Exception as e:
        error = str(e)[:500]
        if status == 0:
            status = 599  # synthetic: client-side failure (timeout, navigation error)

    return FetchResponse(html=html, status=status, final_url=final_url,
                         error=error, clicks_done=clicks_done if 'clicks_done' in locals() else 0)
