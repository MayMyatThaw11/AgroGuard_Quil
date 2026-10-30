from .test_agriquill_market_api import (  # noqa: F401
    BASE,
    BUYER,
    BUYER_B,
    FARMER,
    FARMER_B,
    client,
    isolated,
)

PROFILE = {
    "kind": "household",
    "name": "Daw Hla's family",
    "lat": 17.1,
    "lon": 96.05,
    "township": "Hmawbi",
    "crops": [{"produce": "tomato", "area_ha": 0.5, "harvest_month": 3}],
    "wants": ["cash-at-harvest"],
}
ORDER = {
    "produce": "tomato",
    "total_kg": 10_000,
    "delivery_months": [3],
    "town": "Taikkyi",
    "lat": 17.32,
    "lon": 95.97,
    "price": {"kind": "fixed", "mmk_kg": 1900},
    "offers": ["pays-within-3d"],
}


def setup() -> tuple[str, str]:
    order = client.post(f"{BASE}/season-orders", json=ORDER, headers=BUYER)
    assert order.status_code == 201
    made = client.post(f"{BASE}/producers", json=PROFILE, headers=FARMER)
    assert made.status_code == 201
    return order.json()["id"], made.json()["id"]


def test_only_buyers_post_season_orders_and_lists_are_validated() -> None:
    assert client.post(f"{BASE}/season-orders", json=ORDER, headers=FARMER).status_code == 403
    bad = client.post(
        f"{BASE}/season-orders", json={**ORDER, "offers": ["free-money"]}, headers=BUYER
    )
    assert bad.status_code == 422


def test_farmer_sees_matches_with_reasons_and_no_fare_and_strangers_are_refused() -> None:
    order_id, pid = setup()
    rows = client.get(f"{BASE}/season-orders/matches", params={"producer_id": pid}, headers=FARMER)
    assert rows.status_code == 200
    [row] = rows.json()
    assert row["order_id"] == order_id and row["fit"] in ("good", "strong")
    assert {"location", "area", "needs-met"} <= {r["id"] for r in row["reasons"]}
    assert not any(w in rows.text.lower() for w in ("fare", "transport", "landed"))
    other = client.get(
        f"{BASE}/season-orders/matches", params={"producer_id": pid}, headers=FARMER_B
    )
    assert other.status_code == 403
    assert (
        client.get(
            f"{BASE}/season-orders/matches", params={"producer_id": pid}, headers=BUYER
        ).status_code
        == 403
    )


def test_reserve_then_buyer_sees_progress_and_over_reserve_is_422() -> None:
    order_id, pid = setup()
    url = f"{BASE}/season-orders/{order_id}/reserve"
    assert (
        client.post(url, json={"producer_id": pid, "kg": 1000}, headers=FARMER_B).status_code == 403
    )
    assert (
        client.post(url, json={"producer_id": pid, "kg": 99_999}, headers=FARMER).status_code == 422
    )
    assert (
        client.post(url, json={"producer_id": pid, "kg": 1000}, headers=FARMER).status_code == 201
    )
    [mine] = client.get(f"{BASE}/season-orders/mine", headers=BUYER).json()
    assert (mine["reserved_kg"], mine["target_kg"]) == (1000, 10_000)
    assert mine["farmers"][0]["needs_met"] == ["cash-at-harvest"]
    assert client.get(f"{BASE}/season-orders/mine", headers=BUYER_B).json() == []


def test_new_buyer_reliability_says_new() -> None:
    body = client.get(f"{BASE}/buyers/ag:3/reliability", headers=FARMER).json()
    assert body["new"] is True and body["median_days_to_pay"] is None


def test_signals_ready_date_expected_kg_grade_and_listing_check() -> None:
    _, pid = setup()
    sig = client.get(
        f"{BASE}/signals",
        params={"producer_id": pid, "produce": "tomato", "severity": "high"},
        headers=FARMER,
    ).json()
    assert sig["ready_on"]["source"] == "profile-month"
    assert sig["expected_kg"]["kg"] > 0
    assert sig["grade"]["advice"] == "processor-for-grade" and sig["market_open"] is True
    stranger = client.get(
        f"{BASE}/signals", params={"producer_id": pid, "produce": "tomato"}, headers=FARMER_B
    )
    assert stranger.status_code == 403
    expected = sig["expected_kg"]["kg"]
    body = {
        "produce": "tomato",
        "qty_kg": expected * 4,
        "ready_on": "2027-03-15",
        "town": "Hmawbi",
        "lat": 17.1,
        "lon": 96.05,
        "producer_id": pid,
    }
    made = client.post(f"{BASE}/listings", json=body, headers=FARMER)
    assert made.status_code == 201 and made.json()["check"] == {"expected_kg": expected}
    fine = client.post(f"{BASE}/listings", json={**body, "qty_kg": expected}, headers=FARMER)
    assert fine.json()["check"] is None


def test_plant_ideas_endpoint_is_guarded_and_returns_a_list() -> None:
    _, pid = setup()
    ok = client.get(f"{BASE}/plant-ideas", params={"producer_id": pid, "month": 3}, headers=FARMER)
    assert ok.status_code == 200 and isinstance(ok.json(), list)
    no = client.get(
        f"{BASE}/plant-ideas", params={"producer_id": pid, "month": 3}, headers=FARMER_B
    )
    assert no.status_code == 403


def test_surplus_route_is_for_food_businesses_only() -> None:
    params = {"produce": "potato", "lat": 17.3, "lon": 95.97, "on": "2027-03-15"}
    ok = client.get(f"{BASE}/surplus", params=params, headers=BUYER)
    assert ok.status_code == 200 and isinstance(ok.json(), list)
    assert client.get(f"{BASE}/surplus", params=params, headers=FARMER).status_code == 403
