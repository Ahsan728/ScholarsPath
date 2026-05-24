#!/usr/bin/env python3
"""
Apply student_allowlist + payment_requests migrations to Supabase.
Uses the postgres connection string (PGDATABASE_URL or built from SUPABASE_URL).

Run:  cd crawlers && python apply_payment_migrations.py
"""
import os, sys, re
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from dotenv import load_dotenv
import httpx

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

SCRIPT_DIR = os.path.join(os.path.dirname(__file__), "..", "scripts")
MIGRATIONS = [
    "student_allowlist_migration.sql",
    "payment_requests_migration.sql",
]


def run_sql_via_rpc(sql: str) -> tuple[bool, str]:
    """
    Tries to execute SQL via the Supabase Management API or a postgres
    function. If the database doesn't expose an exec_sql RPC, we fall back to
    printing the SQL so the user can paste it into the Supabase SQL Editor.
    """
    # Approach 1: try a known RPC function name like 'exec_sql' if it exists.
    try:
        r = httpx.post(
            f"{SB_URL}/rest/v1/rpc/exec_sql",
            headers={
                "apikey": SB_KEY,
                "Authorization": f"Bearer {SB_KEY}",
                "Content-Type": "application/json",
            },
            json={"query": sql},
            timeout=30,
        )
        if r.status_code in (200, 204):
            return True, "OK via exec_sql RPC"
    except Exception:
        pass
    return False, "No exec_sql RPC available — paste this SQL manually in Supabase SQL Editor"


def main():
    print("=" * 60)
    print("Migrations to apply (in order):")
    for m in MIGRATIONS:
        print(f"  - {m}")
    print("=" * 60)
    print()

    for m in MIGRATIONS:
        path = os.path.join(SCRIPT_DIR, m)
        with open(path, "r", encoding="utf-8") as f:
            sql = f.read()

        print(f"\n>>> {m}")
        print("-" * 60)

        ok, msg = run_sql_via_rpc(sql)
        if ok:
            print(f"✓ {msg}")
        else:
            print(f"⚠ {msg}")
            print()
            print("--- SQL to copy/paste ---")
            print(sql)
            print("--- end ---")

    print()
    print("=" * 60)
    print("MANUAL STEP REQUIRED:")
    print("  Open Supabase Dashboard → Storage → New bucket")
    print("    name:    receipts")
    print("    public:  No")
    print("  Then under bucket policies, add:")
    print("    1. INSERT policy for authenticated users, path = '{auth.uid()}/*'")
    print("    2. SELECT policy for service_role (full access)")
    print("=" * 60)


if __name__ == "__main__":
    main()
