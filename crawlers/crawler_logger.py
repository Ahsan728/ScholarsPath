"""
Lightweight helper any crawler can import to write its run to `crawler_runs`
and optional per-item rows to `crawler_events`. The admin /admin/crawlers
page then renders all of this without any extra code per-crawler.

Usage:

    from crawler_logger import CrawlerRun

    with CrawlerRun("url_validator", params={"country": "Germany"}) as run:
        run.set_total(1000)
        for p in programs:
            try:
                ...
                run.ok()
            except Exception as e:
                run.failed(target_id=p["id"], message=str(e))
        run.summary = {"dead": 42, "ok": 950, "redirect": 8}

If anything blows up, __exit__ marks the run failed with the traceback.
"""

import os
import socket
import sys
import time
import traceback
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CrawlerRun:
    def __init__(self, crawler: str, params: Optional[dict] = None):
        self.crawler = crawler
        self.params = params or {}
        self.run_id: Optional[str] = None
        self.started_at = time.time()

        self.items_total = 0
        self.items_processed = 0
        self.items_ok = 0
        self.items_failed = 0
        self.items_skipped = 0
        self.tokens_in = 0
        self.tokens_out = 0
        self.cost_usd = 0.0
        self.summary: dict = {}

    # ---- context manager ------------------------------------------------
    def __enter__(self) -> "CrawlerRun":
        payload = {
            "crawler": self.crawler,
            "status": "running",
            "started_at": _utcnow_iso(),
            "params": self.params,
            "host": socket.gethostname(),
        }
        r = httpx.post(
            f"{SB_URL}/rest/v1/crawler_runs",
            headers=SB_HEADERS, json=payload, timeout=20,
        )
        if r.status_code in (200, 201) and r.json():
            self.run_id = r.json()[0]["id"]
            print(f"[run] {self.crawler} started — id={self.run_id}", flush=True)
        else:
            print(f"[run] WARN could not log start: {r.status_code} {r.text[:200]}", flush=True)
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc:
            self._finish("failed",
                         error_message=f"{exc_type.__name__}: {exc}\n{''.join(traceback.format_tb(tb))[:2000]}")
        else:
            self._finish("completed")
        return False  # don't swallow exceptions

    # ---- counters -------------------------------------------------------
    def set_total(self, n: int) -> None:
        self.items_total = n

    def ok(self, n: int = 1) -> None:
        self.items_ok += n
        self.items_processed += n

    def skipped(self, n: int = 1) -> None:
        self.items_skipped += n
        self.items_processed += n

    def failed(self, n: int = 1, target_id: Optional[str] = None,
               target_url: Optional[str] = None, message: Optional[str] = None,
               meta: Optional[dict] = None) -> None:
        self.items_failed += n
        self.items_processed += n
        if message:
            self.event("error", target_id=target_id, target_url=target_url,
                       message=message, meta=meta)

    def event(self, level: str, target_id: Optional[str] = None,
              target_url: Optional[str] = None, message: Optional[str] = None,
              meta: Optional[dict] = None) -> None:
        if not self.run_id:
            return
        try:
            httpx.post(
                f"{SB_URL}/rest/v1/crawler_events",
                headers=SB_HEADERS,
                json={
                    "run_id": self.run_id,
                    "level": level,
                    "target_id": target_id,
                    "target_url": target_url,
                    "message": (message or "")[:2000],
                    "meta": meta,
                },
                timeout=10,
            )
        except Exception:
            pass  # never let logging take down the crawler

    def add_cost(self, tokens_in: int = 0, tokens_out: int = 0, cost_usd: float = 0.0) -> None:
        self.tokens_in += tokens_in
        self.tokens_out += tokens_out
        self.cost_usd += cost_usd

    # ---- internals ------------------------------------------------------
    def _finish(self, status: str, error_message: Optional[str] = None) -> None:
        if not self.run_id:
            print(f"[run] finish (no id): status={status}", flush=True)
            return
        duration_ms = int((time.time() - self.started_at) * 1000)

        # Cost / token fields can be written DIRECTLY to the DB during the run
        # by helpers like crawlers/ai/extract.py (which doesn't have a handle
        # on this object). To avoid clobbering those writes with our in-memory
        # zeros, read what's currently in the DB and take the max.
        db_cost, db_in, db_out = 0.0, 0, 0
        try:
            cur = httpx.get(
                f"{SB_URL}/rest/v1/crawler_runs",
                headers={"apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
                         "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}"},
                params={"select": "cost_usd,tokens_in,tokens_out",
                        "id": f"eq.{self.run_id}"},
                timeout=10,
            )
            if cur.status_code == 200 and cur.json():
                row = cur.json()[0]
                db_cost = float(row.get("cost_usd")  or 0)
                db_in   = int(row.get("tokens_in")   or 0)
                db_out  = int(row.get("tokens_out")  or 0)
        except Exception:
            pass  # use in-memory values only

        body = {
            "status": status,
            "finished_at": _utcnow_iso(),
            "duration_ms": duration_ms,
            "items_total": self.items_total,
            "items_processed": self.items_processed,
            "items_ok": self.items_ok,
            "items_failed": self.items_failed,
            "items_skipped": self.items_skipped,
            # Take the max of in-memory vs already-on-DB so neither path loses
            "tokens_in":  max(self.tokens_in,  db_in),
            "tokens_out": max(self.tokens_out, db_out),
            "cost_usd":   round(max(self.cost_usd, db_cost), 4),
            "summary": self.summary,
            "error_message": error_message,
        }
        try:
            r = httpx.patch(
                f"{SB_URL}/rest/v1/crawler_runs?id=eq.{self.run_id}",
                headers=SB_HEADERS, json=body, timeout=20,
            )
            print(f"[run] {self.crawler} {status} ({duration_ms}ms) "
                  f"ok={self.items_ok} failed={self.items_failed} "
                  f"skipped={self.items_skipped} cost=${body['cost_usd']}", flush=True)
        except Exception as e:
            print(f"[run] WARN could not log finish: {e}", flush=True)
