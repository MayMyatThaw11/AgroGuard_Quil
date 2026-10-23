import re
from typing import Any

import pytest

from agriquill import flows, rehearse
from tests.test_agriquill_model_card import client, isolated, log_days, offline  # noqa: F401

FARM = "farm_ayeyarwady_demo"
BASE = f"/api/v1/agriquill/contracts/{FARM}"
PROVENANCE = frozenset({"source", "provenance", "basis", "sources"})
STRUCTURAL = {
    "crew": "the crew size the caller sent in the request",
    "scheduled": "a count of jobs the scheduler placed",
    "by_hand": "a count of scheduled jobs done by hand",
    "unpriced_jobs": "a count of jobs with no price",
    "banned_inputs": "a count of input records that matched a banned list",
    "day_offset": "an index: days from today",
    "start_index": "an index into the hourly forecast",
}
TO_VERIFY = re.compile(r"to[\s_-]*verify", re.IGNORECASE)
PERSONAS = {
    "variations": [{"persona": "manual", "crew": 2}, {"persona": "tech", "crew": 2, "label": "t"}]
}


def _has_source(node: dict[str, Any], key: str | None = None) -> bool:
    names = PROVENANCE if key is None else {f"{key}_{k}" for k in PROVENANCE}
    return any(node.get(k) for k in names)


def bare_numbers(node: Any, path: str = "$", covered: bool = False) -> list[tuple[str, float]]:
    """Numeric leaves with no provenance on themselves, their own dict or a named block.

    A provenance key on the root covers only the root's own numbers, not nested blocks.
    """
    found: list[tuple[str, float]] = []
    if isinstance(node, dict):
        here = covered or _has_source(node)
        below = here if path != "$" else covered
        items = [(f"{path}.{k}", k, v) for k, v in node.items()]
    elif isinstance(node, list):
        here = below = covered
        items = [(f"{path}[*]", path.rsplit(".", 1)[-1], v) for v in node]
    else:
        return found
    for at, key, value in items:
        own = isinstance(node, dict) and _has_source(node, key)
        if isinstance(value, int | float) and not isinstance(value, bool):
            if not (here or own) and key not in STRUCTURAL:
                found.append((at, value))
        else:
            found.extend(bare_numbers(value, at, below or own))
    return found


def _strip_sources(node: Any) -> Any:
    if isinstance(node, dict):
        return {
            k: _strip_sources(v)
            for k, v in node.items()
            if k not in PROVENANCE and not k.endswith(tuple(f"_{p}" for p in PROVENANCE))
        }
    if isinstance(node, list):
        return [_strip_sources(v) for v in node]
    return node


def strings(node: Any) -> list[str]:
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [s for v in node.values() for s in strings(v)]
    if isinstance(node, list):
        return [s for v in node for s in strings(v)]
    return []


def fetch(name: str) -> Any:
    if name == "persona-plan":
        res = client.post(f"{BASE}/persona-plan", json=PERSONAS)
    elif name == "evidence-pack":
        res = client.get(f"{BASE}/evidence-pack", params={"parcel": "PD-01"})
    else:
        res = client.get(f"{BASE}/{name}")
    assert res.status_code == 200, res.text
    return res.json()


ENDPOINTS = ("flows", "harvest-reference", "persona-plan", "model-card", "evidence-pack")
NAMED = {
    "persona-plan": (
        "$.plans[*].outcome.lateness_h",
        "$.plans[*].outcome.cost.priced_total",
        "$.plans[*].outcome.cost.inflation_pct",
        "$.plans[*].tasks[*].schedule.duration_h",
        "$.plans[*].tasks[*].water.floor_cm",
        "$.plans[*].tasks[*].water.target_cm",
    ),
    "evidence-pack": ("$.plot.area_ha",),
}
NAMED_CASES = [pytest.param(name, path, id=path) for name, paths in NAMED.items() for path in paths]


@pytest.fixture
def readings() -> None:
    log_days("PD-01-tube")
    log_days("PD-02-tube")


def test_the_walker_catches_a_bare_number():
    fake = {
        "farm_id": "x",
        "yield": {"t_ha": 3.1, "source": "FAOSTAT"},
        "pairs": 40,
        "rows": [{"mae_cm": 1.2}],
        "band": {"p50": [1.0, 2.0]},
        "flagged": True,
    }
    assert bare_numbers(fake) == [
        ("$.pairs", 40),
        ("$.rows[*].mae_cm", 1.2),
        ("$.band.p50[*]", 1.0),
        ("$.band.p50[*]", 2.0),
    ]
    assert bare_numbers({"source": None, "t_ha": 3.1}) == [("$.t_ha", 3.1)]
    assert bare_numbers({"sources": {"w": "FAO-56"}, "deep": {"x": [1]}}) == [("$.deep.x[*]", 1)]
    assert bare_numbers({"sources": {"w": "FAO-56"}, "n": 1}) == []
    assert bare_numbers({"block": {"source": "IPCC", "deep": {"x": [1]}}}) == []
    assert bare_numbers({"cost": {"total": 3, "total_basis": "sum of prices"}}) == []
    assert bare_numbers({"cost": {"total": 3, "total_basis": None}}) == [("$.cost.total", 3)]
    assert bare_numbers({"p": {"t": [1, 2], "t_basis": "area x yield"}}) == []
    assert bare_numbers({"crew": 2, "plans": [{"crew": 3}]}) == []


@pytest.mark.usefixtures("readings")
@pytest.mark.parametrize("name", ENDPOINTS)
def test_every_api_number_carries_provenance(name: str):
    assert bare_numbers(fetch(name)) == []


@pytest.mark.usefixtures("readings")
@pytest.mark.parametrize(("name", "path"), NAMED_CASES)
def test_named_numbers_are_present_and_carry_a_source(name: str, path: str):
    body = fetch(name)
    assert path in {p for p, _ in bare_numbers(_strip_sources(body))}
    assert path not in {p for p, _ in bare_numbers(body)}


@pytest.mark.usefixtures("readings")
@pytest.mark.parametrize("name", ENDPOINTS)
def test_to_verify_labels_reach_the_api_unchanged(name: str):
    text = strings(fetch(name))
    bent = [s for s in text if TO_VERIFY.search(s) and "TO VERIFY" not in s]
    assert bent == []


@pytest.mark.usefixtures("readings")
def test_named_to_verify_values_reach_the_api_verbatim():
    wet = f"hours with relative humidity at or above {flows.WET_RH_PCT:g} %, TO VERIFY"
    assert wet in strings(fetch("flows"))
    card = strings(fetch("model-card"))
    assert rehearse.STATUS in card and "TO VERIFY" in card
