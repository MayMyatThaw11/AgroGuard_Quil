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


def bare_numbers(node: Any, path: str = "$", covered: bool = False) -> list[tuple[str, float]]:
    """Numeric leaves with no provenance key beside them or on any enclosing dict."""
    found: list[tuple[str, float]] = []
    if isinstance(node, dict):
        here = covered or any(node.get(k) for k in PROVENANCE)
        items = [(f"{path}.{k}", k, v) for k, v in node.items()]
    elif isinstance(node, list):
        here = covered
        items = [(f"{path}[*]", path.rsplit(".", 1)[-1], v) for v in node]
    else:
        return found
    for at, key, value in items:
        if isinstance(value, int | float) and not isinstance(value, bool):
            if not here and key not in STRUCTURAL:
                found.append((at, value))
        else:
            found.extend(bare_numbers(value, at, here))
    return found


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
KNOWN = {
    "persona-plan": {
        "$.plans[*].outcome.lateness_h": "personas.run: schedule lateness with no source",
        "$.plans[*].outcome.cost.priced_total": "personas.cost: priced total with no source",
        "$.plans[*].outcome.cost.inflation_pct": "personas.cost: echoes the caller's inflation",
        "$.plans[*].tasks[*].schedule.duration_h": "schedule.solve: job hours, contract or default",
        "$.plans[*].tasks[*].water.floor_cm": "farmers task water floor from the contract",
        "$.plans[*].tasks[*].water.target_cm": "farmers task water target from the contract",
    },
    "evidence-pack": {
        "$.plot.area_ha": "evidence_pack.build: contract area beside contract_sha256, no source",
    },
}
KNOWN_CASES = [
    pytest.param(name, path, marks=pytest.mark.xfail(strict=True, reason=reason), id=path)
    for name, paths in KNOWN.items()
    for path, reason in paths.items()
]


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
    assert bare_numbers({"sources": {"w": "FAO-56"}, "deep": {"x": [1]}}) == []
    assert bare_numbers({"crew": 2, "plans": [{"crew": 3}]}) == []


@pytest.mark.usefixtures("readings")
@pytest.mark.parametrize("name", ENDPOINTS)
def test_every_api_number_carries_provenance(name: str):
    found = {path for path, _ in bare_numbers(fetch(name))}
    assert found - set(KNOWN.get(name, {})) == set(), sorted(found)


@pytest.mark.usefixtures("readings")
@pytest.mark.parametrize(("name", "path"), KNOWN_CASES)
def test_known_bare_numbers_get_a_source(name: str, path: str):
    assert path not in {p for p, _ in bare_numbers(fetch(name))}


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
