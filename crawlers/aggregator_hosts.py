"""Single source of truth for known aggregator/scam domains.

Loaded from data/aggregator_hosts.json (same file used by
lib/aggregatorHosts.ts). Imported by Discoverer + URL validators to
auto-reject rows whose apply_url host is on the blocklist.
"""

import json
import os
from urllib.parse import urlparse

_HOSTS_FILE = os.path.join(
    os.path.dirname(__file__), "..", "data", "aggregator_hosts.json"
)

with open(_HOSTS_FILE, encoding="utf-8") as f:
    _DATA = json.load(f)

AGGREGATOR_HOSTS: set[str] = set(_DATA["hosts"])


def is_aggregator_host(url: str) -> bool:
    """True if the given URL's host is on the aggregator/scam blocklist.
    Matches exact host AND subdomains (foo.mastersportal.com counts as
    mastersportal.com)."""
    if not url:
        return False
    try:
        host = (urlparse(url).hostname or "").lower().lstrip("www.")
        if host in AGGREGATOR_HOSTS:
            return True
        for blocked in AGGREGATOR_HOSTS:
            if host.endswith("." + blocked):
                return True
        return False
    except Exception:
        return False
