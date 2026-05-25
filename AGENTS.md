# Agent Conventions — ScholarAssist

This file is the contract for any agent (Codex, Claude Code, future tools)
writing code in this repo. **Read it before opening a PR.**

The full architectural plan lives at
`C:\Users\YOU TECH BD\.claude\plans\async-skipping-anchor.md` (Claude Code's
local plan store). The summary below is enough to work from.

---

## Repo layout (what's real)

- **Workspace root** = `d:\Software Dev\ScholarsPath\` — the live Next.js 14
  app. Edit files here.
- `scholars-platform/` (subdir) — **half-finished duplicate, ignore.**
  Already in `.vercelignore` and `.gitignore`. Don't read, don't edit.
- `app/` — Next.js App Router pages + API routes
- `components/` — shared React components
- `lib/` — server + browser shared TypeScript modules
- `crawlers/` — Python workers (one file per agent)
- `scripts/` — SQL migrations (run manually in Supabase SQL Editor)
- `Documents/` — raw input dumps from Ahsan. **Gitignored.** Use as parser
  fixtures locally only.
- `Documents/sources/` — curated URL lists / reference docs for Source
  Ingester (also gitignored — sources live in DB after ingestion).

---

## Agents (six workers + observer)

All code is owned by **Claude Code** (interactive Anthropic agent in the
session) with the user (Ahsan) reviewing and merging every PR. External
coding agents are not currently in the rotation.

| # | Agent (`crawler` name) | Script | AI cost |
|---|---|---|---|
| 1 | `program_ingester_*` | `crawlers/insert_*.py` (one per source file) | $0 |
| 2 | `source_ingester` | `crawlers/ingest_opportunity_sources.py` | ~$0.02/rich doc |
| 3 | `url_validator` | `crawlers/validate_program_urls.py` | $0 |
| 4 | `domain_mismatch_detector` | `crawlers/detect_domain_mismatch.py` | $0 |
| 5 | `program_corrector` | `crawlers/enrich_program_urls.py` | ~$0.001/program |
| 6 | `opportunity_discoverer` | `crawlers/discover_opportunities.py` | hard $20/run |

Each agent is a single Python file under `crawlers/` and gets observed via
`crawler_runs` + `crawler_events`.

---

## Hard rules — never break these

1. **Never commit secrets.** `.env.local` is gitignored. Do not echo or paste
   any value containing `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
   `OPENAI_API_KEY`, `BREVO_API_KEY`, or `ADMIN_SECRET` into any file.
2. **Never expose the service-role key to the browser.** Server-side only.
   - Server / API routes / Server Components: `adminSupabase` from `lib/supabase.ts`
   - User-context Server Components: `createServerSupabase()` (anon key + cookies)
   - Client components: `supabase` from `lib/supabase-browser.ts` (anon, cookie-aware)
3. **Never overwrite the `scholars-platform/` subdirectory.** It's a dead
   duplicate. Edit at the workspace root only.
4. **Never use `git push --force`, `git reset --hard`, or `--no-verify`.**
   Open a PR; let a human merge.
5. **Never create empty commits or `--amend` after a hook failure.** Fix the
   issue, stage, make a NEW commit.

---

## Patterns to follow

### Python crawlers

Every new crawler script:

```python
#!/usr/bin/env python3
"""One-line summary. Multiline docstring with run examples below."""
import os, sys, argparse
sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows-safe

import httpx
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from crawler_logger import CrawlerRun  # see crawlers/crawler_logger.py

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
              "Content-Type": "application/json", "Prefer": "return=minimal"}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--country", type=str, default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    params = {k: v for k, v in vars(args).items() if v is not None}
    with CrawlerRun("<agent-name>", params=params) as run:
        # ... do work, call run.ok() / run.failed() / run.skipped() per item
        # run.summary = {...}  # final aggregates
```

Required:
- `--dry-run` flag (print intended writes, write nothing)
- `--limit`, `--country` flags (consistent across agents)
- Wrap the entire run in `with CrawlerRun(...)` — never bypass observability
- DB writes via the Supabase REST API (httpx) using `SB_HEADERS`
- Upsert / dedupe by stable key — every script must be idempotent

### Next.js API routes

- Admin routes: gate with `req.cookies.get("admin_auth")?.value !== process.env.ADMIN_SECRET`
- Whitelist the fields a route is allowed to update (see
  `app/api/admin/programs/[id]/route.ts` for the pattern)
- Use `adminSupabase` (service role) for admin routes
- Mark API routes that read cookies or environment as `export const dynamic = "force-dynamic"`

### Tier checks (React + API)

Use the helpers, never compare strings directly:
```ts
import { isProTier, isStudentTier } from "@/lib/tier"
if (isProTier(tier)) { ... }   // pro OR student
if (isStudentTier(tier)) { ... }  // student only — for CV evaluation
```

### LLM calls (Phase B onwards)

Once `lib/ai/extract.ts` + `crawlers/ai/extract.py` exist, **never call the
Anthropic or OpenAI SDK directly**. Route everything through the wrapper:

```ts
import { extractJson } from "@/lib/ai/extract"
const data = await extractJson({
  prompt, schema, provider: "openai", runId
})
```

The wrapper enforces budget caps, schema validation, retry, and cost logging.

---

## Coding style

- TypeScript: prefer existing patterns from neighboring files. No new deps
  without flagging in the PR description.
- Python: type hints, `f-strings`, `httpx` for HTTP, never `requests`.
- Don't add comments that restate what the code does. Comments answer *why*.
- Don't introduce new abstractions unless the same pattern appears 3+ times.

---

## Git workflow

- Branch name: `codex/<short-task>` or `cc/<short-task>` (claude code)
- Commit message: imperative present tense, ≤72 char subject line,
  body explains *why* not *what*
- Open a PR against `main`. Title is what shows up in the changelog.
- One PR = one focused change. Don't bundle.

---

## How to verify your work

Every PR description must include:

1. **What it does** (1–3 sentences)
2. **Verification steps** — exact commands a reviewer can run locally:
   ```
   npm run build
   python crawlers/<your_script>.py --dry-run --limit 10
   # then open /admin/<page> and check ...
   ```
3. **Risk + rollback** — if it touches DB, name the affected tables and
   how to undo (snapshot table, REVOKE, etc.)

If `npm run build` doesn't pass locally, the PR isn't ready.

---

## Where to find context

- Architectural plan: ask in PR description or check the live
  `/admin/crawlers` page for current state
- Existing patterns: `git log --oneline -20` shows recent merges to model
- Reference implementations:
  - Parser pattern: `crawlers/insert_natural_science_math.py`
  - Crawler with observability: `crawlers/validate_program_urls.py`
  - Admin page pattern: `app/admin/feedback/{page,FeedbackClient}.tsx`
  - Admin PATCH API pattern: `app/api/admin/programs/[id]/route.ts`
