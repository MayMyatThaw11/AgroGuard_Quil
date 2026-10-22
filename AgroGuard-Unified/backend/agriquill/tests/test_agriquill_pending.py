from datetime import date, timedelta

import pytest

from agriquill import pending


@pytest.mark.parametrize("item", sorted(pending.BLOCKED))
def test_every_blocked_item_names_what_it_is_missing(item):
    out = pending.unavailable(item)
    assert out["status"] == "unavailable" and out["reason"].startswith("unavailable: ")
    assert out["kind"] in {"licence", "value", "photos", "dependency"}


@pytest.mark.parametrize("item", sorted(pending.HARNESSES))
def test_every_w3_harness_waits_for_a_season_of_pilot_data(item):
    assert pending.replay(item, [])["status"] == "needs_pilot_data"


def test_a_full_season_of_complete_rows_is_ready_to_score_and_a_gap_is_rejected():
    fields = pending.HARNESSES["B-TS-9"]["fields"]
    start = date(2026, 6, 1)
    rows = [
        {**{f: 1 for f in fields}, "date": (start + timedelta(days=d)).isoformat()}
        for d in range(90)
    ]
    assert pending.replay("B-TS-9", rows)["status"] == "ready_to_score"
    rows[5]["observed_cm"] = None
    out = pending.replay("B-TS-9", rows)
    assert out["status"] == "needs_pilot_data" and out["rejected_rows"] == [5]


def test_the_roadmap_lists_both_groups():
    out = pending.roadmap()
    assert len(out["blocked"]) == len(pending.BLOCKED)
    assert {h["item"] for h in out["harnesses"]} == set(pending.HARNESSES)
