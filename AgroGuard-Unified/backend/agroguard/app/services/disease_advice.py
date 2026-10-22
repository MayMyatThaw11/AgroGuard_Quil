"""Management advice for a detected plant disease: steps, feeding, and (once reviewed) sprays.

Advice comes from app/data/disease_management.json, one row per disease class. The spray tier is
listed for a class an agronomist has signed off in app/data/disease_advice_reviews.json
({"Rice___Rice_Blast": {"reviewed_by": "Name", "reviewed_on": "2026-11-01"}}), or for every class
while DISEASE_ADVICE_UNREVIEWED_SPRAYS is true. An ingredient on Myanmar's banned or restricted
lists is dropped either way, and it never gives a dose. A review is shown only when a real one
is on file.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.services import decision_engine, pesticide_rules

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
LANGUAGES = ("en", "my")

DISCLAIMER = {
    "unreviewed": {
        "en": (
            "General guidance, not yet reviewed by an agronomist. "
            "It cannot replace someone looking at your field."
        ),
        "my": "ယေဘုယျ လမ်းညွှန်ချက်ဖြစ်ပြီး စိုက်ပျိုးရေးပညာရှင် မစစ်ဆေးရသေးပါ။ လယ်ကွက်ကို လာရောက်ကြည့်ရှုခြင်းကို အစားမထိုးနိုင်ပါ။",
    },
    "reviewed": {
        "en": (
            "Reviewed by {name} on {date}. It still cannot replace someone looking at your field."
        ),
        "my": "{date} တွင် {name} စစ်ဆေးပြီး။ လယ်ကွက်ကို လာရောက်ကြည့်ရှုခြင်းကို အစားမထိုးနိုင်ပါ။",
    },
}


@lru_cache(maxsize=1)
def _management() -> dict[str, Any]:
    return json.loads((DATA_DIR / "disease_management.json").read_text(encoding="utf-8"))


def _reviews() -> dict[str, dict[str, str]]:
    # Read on every call so a reviewer's sign-off shows without restarting the server.
    return json.loads((DATA_DIR / "disease_advice_reviews.json").read_text(encoding="utf-8"))


def known_classes() -> list[str]:
    return sorted(_management()["classes"])


def _safe_ingredients(names: list[str]) -> list[str]:
    return [name for name in names if pesticide_rules.status_of(name) is None]


def advice_for(raw_class_name: str, language: str = "en") -> dict[str, Any] | None:
    data = _management()
    row = data["classes"].get(raw_class_name)
    if row is None:
        return None
    lang = language if language in LANGUAGES else "en"
    review = _reviews().get(raw_class_name) or {}
    reviewed = bool(review.get("reviewed_by") and review.get("reviewed_on"))

    listed = reviewed or get_settings().disease_advice_unreviewed_sprays
    kinds = []
    if listed:
        for kind_id in row["spray"]:
            kind = data["spray_kinds"][kind_id]
            ingredients = _safe_ingredients(kind["ingredients"])
            if ingredients:
                kinds.append({"label": kind[lang], "ingredients": ingredients})
    decision = decision_engine.decide(raw_class_name, lang)
    if not decision["needs_spray"] or not row["spray"]:
        status = "not_applicable"
        kinds = []
    elif not listed:
        status = "awaiting_review"
    else:
        status = "shown" if kinds else "not_applicable"

    disclaimer = DISCLAIMER["reviewed" if reviewed else "unreviewed"][lang].format(
        name=review.get("reviewed_by", ""), date=review.get("reviewed_on", "")
    )
    return {
        "class_name": raw_class_name,
        "cause": row["cause"],
        "cause_label": data["causes"][row["cause"]][lang],
        "steps": [data["steps"][code][lang] for code in row["steps"]],
        "decision": decision,
        "spray": {
            "status": status,
            "when": [line[lang] for line in data["when_to_spray"]] if kinds else [],
            "kinds": kinds,
            "safety": [line[lang] for line in data["safety"]] if kinds else [],
        },
        "reviewed_by": review.get("reviewed_by") if reviewed else None,
        "reviewed_on": review.get("reviewed_on") if reviewed else None,
        "disclaimer": disclaimer,
    }
