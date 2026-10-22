"""Myanmar banned and restricted pesticide ingredients, for checking any advice before it is shown.

The 41 names of Notification 6/2018 were supplied by the team and are not yet checked against
the official PDF; the 7 restricted names are from Notification 5/2018. Advice must still come
from a reviewed allow-list, never from this block-list alone.
"""

import csv
import re
from functools import lru_cache
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "myanmar_banned_restricted.csv"


def _key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


@lru_cache(maxsize=1)
def load_rules() -> dict[str, dict[str, str]]:
    """Every ingredient name and alias, normalised, mapped to its row."""
    rules: dict[str, dict[str, str]] = {}
    with DATA_FILE.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            for name in [row["ingredient"], *filter(None, row["aliases"].split("|"))]:
                rules[_key(name)] = row
    return rules


def status_of(ingredient: str) -> str | None:
    """'banned', 'restricted', or None when the name is not on the transcribed list."""
    row = load_rules().get(_key(ingredient))
    return row["status"] if row else None


def mentions(text: str) -> list[tuple[str, str]]:
    """Banned or restricted ingredients named anywhere in a piece of advice text."""
    haystack = f" {_key(text)} "
    return sorted(
        {
            (row["ingredient"], row["status"])
            for name, row in load_rules().items()
            if len(name) > 3 and f" {name} " in haystack
        }
    )
