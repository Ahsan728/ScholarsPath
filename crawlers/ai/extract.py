"""
Provider-agnostic structured-extraction wrapper for crawlers.

Routes JSON-extraction calls to either Anthropic Haiku or OpenAI gpt-4o-mini
based on the `provider` argument, enforces per-run budget caps via
`crawler_runs.cost_usd`, parses + schema-validates the response, and returns
a Python dict (or raises). Every call's cost is recorded to the run row.

Usage:

    from crawlers.ai.extract import extract_json, BudgetExceeded

    data = extract_json(
        prompt="...",
        run_id=run.run_id,
        max_usd_per_run=5.0,
        provider="openai",      # or "anthropic"
        expected_keys=("title", "scholarships"),
    )

Provider routing default: 'openai' (gpt-4o-mini) for production extraction —
4-5x cheaper per token than Haiku.

NOTE: this wrapper is intentionally small and stateless. It does NOT cache
prompts, does NOT batch — those are agent-level optimisations the Discoverer
will layer on top.
"""

import json
import os
import re
from typing import Iterable, Optional

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env.local"))

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_H = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
        "Content-Type": "application/json"}

# ── Per-provider cost constants (USD per 1M tokens) ───────────
COST = {
    "anthropic": {
        "claude-haiku-4-5":  {"in": 0.80, "out": 4.00},
        "claude-sonnet-4-6": {"in": 3.00, "out": 15.00},
    },
    "openai": {
        "gpt-4o-mini": {"in": 0.15, "out": 0.60},
        "gpt-4o":      {"in": 2.50, "out": 10.00},
    },
}

DEFAULT_MODEL = {
    "anthropic": "claude-haiku-4-5",
    "openai":    "gpt-4o-mini",
}


class BudgetExceeded(Exception):
    """Raised when assert_budget would put the run over its cap."""


class SchemaInvalid(Exception):
    """Raised when the LLM response can't be parsed into expected shape."""


# ── Budget guard ──────────────────────────────────────────────
def _current_run_cost(run_id: str) -> float:
    r = httpx.get(
        f"{SB_URL}/rest/v1/crawler_runs",
        headers=SB_H,
        params={"select": "cost_usd", "id": f"eq.{run_id}"},
        timeout=10,
    )
    if r.status_code != 200:
        return 0.0
    rows = r.json()
    if not rows:
        return 0.0
    return float(rows[0].get("cost_usd") or 0.0)


def _add_run_cost(run_id: str, delta: float, in_tok: int, out_tok: int) -> None:
    """Increment cost_usd / tokens_in / tokens_out for the run row."""
    current = _current_run_cost(run_id)
    # NOTE: not atomic. For higher concurrency we'd want a Postgres function
    # with `UPDATE ... SET cost_usd = cost_usd + $1`. Adequate for sequential
    # single-process crawlers.
    cur_r = httpx.get(
        f"{SB_URL}/rest/v1/crawler_runs",
        headers=SB_H,
        params={"select": "tokens_in,tokens_out", "id": f"eq.{run_id}"},
        timeout=10,
    )
    cur = cur_r.json()[0] if cur_r.status_code == 200 and cur_r.json() else {}
    body = {
        "cost_usd":   round(current + delta, 4),
        "tokens_in":  (cur.get("tokens_in") or 0) + in_tok,
        "tokens_out": (cur.get("tokens_out") or 0) + out_tok,
    }
    httpx.patch(
        f"{SB_URL}/rest/v1/crawler_runs?id=eq.{run_id}",
        headers={**SB_H, "Prefer": "return=minimal"},
        json=body, timeout=10,
    )


def assert_budget(run_id: str, estimated_cost: float, max_usd_per_run: float) -> None:
    """Raise BudgetExceeded if the run would cross its cap with this call."""
    if max_usd_per_run <= 0:
        return  # 0 = unlimited
    spent = _current_run_cost(run_id)
    if spent + estimated_cost > max_usd_per_run:
        raise BudgetExceeded(
            f"run {run_id}: would spend ${spent + estimated_cost:.4f}, "
            f"cap is ${max_usd_per_run:.2f}"
        )


# ── Providers ─────────────────────────────────────────────────
def _call_anthropic(prompt: str, model: str, max_tokens: int) -> tuple[str, int, int]:
    from anthropic import Anthropic
    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    r = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    text = r.content[0].text if r.content else ""
    return text, (r.usage.input_tokens if r.usage else 0), (r.usage.output_tokens if r.usage else 0)


def _call_openai(prompt: str, model: str, max_tokens: int) -> tuple[str, int, int]:
    from openai import OpenAI
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    r = client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "Reply only with valid JSON. No prose, no markdown fences."},
            {"role": "user", "content": prompt},
        ],
    )
    text = r.choices[0].message.content or ""
    return text, (r.usage.prompt_tokens if r.usage else 0), (r.usage.completion_tokens if r.usage else 0)


# ── Public API ────────────────────────────────────────────────
def extract_json(
    *,
    prompt: str,
    run_id: str,
    max_usd_per_run: float,
    provider: str = "openai",
    model: Optional[str] = None,
    max_tokens: int = 2000,
    expected_keys: Iterable[str] = (),
    estimated_cost: float = 0.01,
) -> dict:
    """
    Call the chosen provider for structured JSON extraction.

    Raises:
      BudgetExceeded  — pre-call check failed
      SchemaInvalid   — response wasn't valid JSON, or missed expected_keys
      KeyError        — missing API key env var
    """
    if provider not in COST:
        raise ValueError(f"unknown provider: {provider}")
    model = model or DEFAULT_MODEL[provider]
    if model not in COST[provider]:
        raise ValueError(f"unknown model for {provider}: {model}")

    assert_budget(run_id, estimated_cost, max_usd_per_run)

    if provider == "anthropic":
        text, in_tok, out_tok = _call_anthropic(prompt, model, max_tokens)
    else:
        text, in_tok, out_tok = _call_openai(prompt, model, max_tokens)

    rate = COST[provider][model]
    cost = (in_tok * rate["in"] + out_tok * rate["out"]) / 1_000_000.0
    _add_run_cost(run_id, cost, in_tok, out_tok)

    # Parse — strip code fences if any, then find first JSON object
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    m = re.search(r"\{[\s\S]*\}", cleaned)
    if not m:
        raise SchemaInvalid(f"no JSON object in response: {text[:200]}")
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        raise SchemaInvalid(f"JSON parse failed: {e}")

    for key in expected_keys:
        if key not in data:
            raise SchemaInvalid(f"missing expected key '{key}'")

    return data
