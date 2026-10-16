import json
import zipfile
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import cli, contract, live, onboard, store
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.ledger import get_ledger
from agriquill.mcp import server

FARM = "cust_farm"
SQUARE = [[95.59, 16.728], [95.591, 16.728], [95.591, 16.729], [95.59, 16.729], [95.59, 16.728]]
ET0 = 0.25
KC_TILLERING = 1.05
DAY_DROP_CM = (13 * ET0 * KC_TILLERING + 3.0) / 10.0


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def weather(windy_day: str | None = None, utc_offset_s: int = 0) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        params = request.url.params
        if "start_date" in params:
            start = date.fromisoformat(params["start_date"])
            days = (date.fromisoformat(params["end_date"]) - start).days + 1
        else:
            start, days = datetime.now(UTC).date() - timedelta(days=14), 22
        first = datetime(start.year, start.month, start.day)
        times = [(first + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(days * 24)]
        n = len(times)
        body = {
            "timezone": "GMT",
            "utc_offset_seconds": utc_offset_s,
            "hourly_units": {
                "temperature_2m": "°C",
                "precipitation": "mm",
                "wind_speed_10m": "m/s",
            },
            "hourly": {
                "time": times,
                "temperature_2m": [30.0] * n,
                "relative_humidity_2m": [65.0] * n,
                "wet_bulb_temperature_2m": [25.0] * n,
                "precipitation": [0.0] * n,
                "wind_speed_10m": [7.0 if t[:10] == windy_day else 2.0 for t in times],
                "wind_gusts_10m": [3.0] * n,
                "et0_fao_evapotranspiration": [ET0 if 6 <= i % 24 <= 18 else 0.0 for i in range(n)],
                "is_day": [1 if 6 <= i % 24 <= 18 else 0 for i in range(n)],
            },
        }
        return httpx.Response(200, content=json.dumps(body).encode())

    return httpx.Client(transport=httpx.MockTransport(handler))


def write(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


def register(
    tmp_path: Path, organic: bool = False, planted: str = "2026-08-01", standard: str | None = None
) -> None:
    rings = {"North-field": onboard._ring(SQUARE)}
    fields = onboard.read_fields(
        write(
            tmp_path / "fields.csv",
            "field,crop,variety,planted,stage,area,area_unit\n"
            f"North field,rice_lowland,Paw San Hmwe,{planted},Tillering,2.9,acre\n"
            "ကွင်း ၂,rice_fish,,2026-08-05,,,\n",
        )
    )
    standard = "ASOA_ORGANIC" if organic else standard
    text, _ = onboard.build_contract(
        FARM, "Ko Aung's farm", "MM", fields, rings, "test files", standard
    )
    if organic:
        cap = "    yield_logic {\n        max_canopy_nitrogen: 85 kg/ha\n    }\n\n    schedule {"
        text = text.replace("    schedule {", cap, 1)
    live.register(FARM, text, "tester")


def day_ago(days: int) -> date:
    return datetime.now(UTC).date() - timedelta(days=days)


def nitrogen_row(days: int, product: str = "Ammonium sulphate") -> str:
    when = f"{day_ago(days).isoformat()}T09:00:00+00:00"
    return f"North field,{when},{product},fertiliser,100,kg/ha,46"


def log_inputs(tmp_path: Path, rows: list[str], utc_offset: str | None = None) -> dict:
    sheet = write(
        tmp_path / "inputs.csv",
        "field,applied_at,product,kind,rate,rate_unit,n_pct\n" + "".join(f"{r}\n" for r in rows),
    )
    return onboard.import_inputs(FARM, sheet, utc_offset, "Ko Aung")


def test_boundaries_become_closed_lat_lon_rings(tmp_path: Path):
    geo = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"name": "North field"},
                "geometry": {"type": "Polygon", "coordinates": [SQUARE[:-1]]},
            }
        ],
    }
    rings = onboard.read_boundaries(write(tmp_path / "f.geojson", json.dumps(geo)))
    assert list(rings) == ["North-field"]
    assert rings["North-field"][0] == [16.728, 95.59] == rings["North-field"][-1]
    coords = " ".join(f"{lon},{lat},0" for lon, lat in SQUARE)
    kml = (
        '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2">'
        f"<Document><Placemark><name>ကွင်း ၁</name><Polygon><outerBoundaryIs><LinearRing>"
        f"<coordinates>{coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>"
        "</Placemark></Document></kml>"
    )
    from_kml = onboard.read_boundaries(write(tmp_path / "f.kml", kml))
    key = onboard.field_id("ကွင်း ၁")
    assert key.startswith("F-") and list(from_kml) == [key]
    assert contract.ring_area_ha(from_kml[key]) == pytest.approx(1.18, abs=0.02)
    kmz = tmp_path / "f.kmz"
    with zipfile.ZipFile(kmz, "w") as archive:
        archive.writestr("doc.kml", kml)
    assert onboard.read_boundaries(kmz) == from_kml
    bare = tmp_path / "bare.kmz"
    with zipfile.ZipFile(bare, "w") as archive:
        archive.writestr("fields/north.kml", kml)
    assert onboard.read_boundaries(bare) == from_kml
    empty = tmp_path / "empty.kmz"
    with zipfile.ZipFile(empty, "w") as archive:
        archive.writestr("readme.txt", "no map here")
    with pytest.raises(ValueError, match="empty.kmz: no KML inside the KMZ"):
        onboard.read_boundaries(empty)


def test_field_sheet_errors_name_the_line(tmp_path: Path):
    bad = write(tmp_path / "bad.csv", "field,planted\nNorth,01/08/2026\n")
    with pytest.raises(ValueError, match="line 2: planted must be YYYY-MM-DD"):
        onboard.read_fields(bad)


def test_onboarded_contract_verifies_with_acres_and_a_shared_location(tmp_path: Path):
    register(tmp_path)
    spec = live.load(FARM)[1]["contract"]
    north, second = spec["parcels"]
    assert north["id"] == "North-field" and north["area_ha"] == round(2.9 * onboard.ACRE_HA, 3)
    assert north["stage"] == "Tillering" and north["crop"] == "Paw San Hmwe"
    assert second["crop_id"] == "rice_fish" and second["boundary"] is None
    assert spec["farm"]["location"] == [16.7285, 95.5905]
    assert contract.gates_for(spec)["max_wind_ms"] == 5.5


def test_readings_import_keeps_good_rows_and_names_bad_ones(tmp_path: Path):
    register(tmp_path)
    when = (datetime.now(UTC) - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M")
    day = (datetime.now(UTC) - timedelta(days=2)).date().isoformat()
    sheet = write(
        tmp_path / "readings.csv",
        "field,observed_at,water_depth_cm,reporter\n"
        f"North field,{when},5.0,Ko Aung\n"
        f"North field,{when},5.0,Ko Aung\n"
        f"Nowhere,{when},1.0,Ko Aung\n"
        f"North field,{day},4.0,\n"
        "North field,2026-13-01T08:00,3.0,Ko Aung\n"
        f"North field,{day}T09:00,99,Ko Aung\n",
    )
    out = onboard.import_readings(FARM, sheet, "+06:30", "Team")
    assert (out["stored"], out["duplicate"], out["assumed_time"]) == (2, 1, 1)
    assert [r["line"] for r in out["rejected"]] == [4, 6, 7]
    assert "not in the contract" in out["rejected"][0]["reason"]
    naive = onboard.import_readings(FARM, sheet, None, "Team")
    assert naive["stored"] == 0
    assert sum("UTC offset, for example" in r["reason"] for r in naive["rejected"]) == 4


def test_backtest_scores_the_model_against_no_change(tmp_path: Path):
    register(tmp_path)
    base = datetime.now(UTC).replace(hour=8, minute=0, second=0, microsecond=0) - timedelta(days=10)
    values = [5.0, 5.0 - DAY_DROP_CM, 9.0, 9.0 - DAY_DROP_CM - 0.5, 9.0 - 2 * DAY_DROP_CM - 0.5]
    rows = "".join(
        f"North field,{(base + timedelta(days=i)).isoformat()},{v:.4f},Ko Aung\n"
        for i, v in enumerate(values)
    )
    sheet = write(tmp_path / "r.csv", "field,observed_at,water_depth_cm\n" + rows)
    assert onboard.import_readings(FARM, sheet, reporter="Team")["stored"] == 5
    windy = (base + timedelta(days=2)).date().isoformat()
    out = onboard.backtest(FARM, weather(windy))
    assert out["status"] == "OK"
    assert out["inflow_events"] == 1
    overall = out["overall"]
    assert overall["pairs"] == 3
    assert overall["model_mae_cm"] == pytest.approx(0.5 / 3, abs=0.01)
    assert overall["no_change_mae_cm"] == pytest.approx((3 * DAY_DROP_CM + 0.5) / 3, abs=0.01)
    assert out["seepage_mm_day"]["median"] == pytest.approx(3.0, abs=0.1)
    spray = out["spray_history"]
    assert spray["closed_days"] == [windy] and "wind" in spray["blocked_hours_by_gate"]


def test_backtest_without_readings_is_null_with_reason(tmp_path: Path):
    register(tmp_path)
    out = onboard.backtest(FARM, weather())
    assert out["status"] == "NO_READINGS" and "import the sheet" in out["missing"][0]["reason"]


def test_farm_check_report_states_the_score_and_the_limits(tmp_path: Path):
    register(tmp_path)
    base = datetime.now(UTC) - timedelta(days=4)
    sheet = write(
        tmp_path / "r.csv",
        "field,observed_at,water_depth_cm\n"
        f"North field,{base.isoformat(timespec='seconds')},5.0\n"
        f"North field,{(base + timedelta(days=1)).isoformat(timespec='seconds')},4.2\n",
    )
    onboard.import_readings(FARM, sheet, reporter="Team")
    report = onboard.to_markdown(onboard.farm_check(FARM, weather()))
    assert "# Farm check: Ko Aung's farm" in report
    assert "no change" in report and "chain verified" in report
    assert "not a gauge on the farm" in report


def test_inputs_import_keeps_good_rows_and_names_bad_ones(tmp_path: Path):
    register(tmp_path)
    day = day_ago(5).isoformat()
    spray = f"North field,{day}T10:00:00+00:00,Neem oil,spray,2,L/ha,"
    out = log_inputs(
        tmp_path,
        [
            spray,
            spray,
            f"Nowhere,{day}T10:00:00+00:00,Neem oil,spray,,,",
            f"North field,{day}T11:00:00+00:00,Neem oil,dusting,,,",
            f"North field,{day},Compost,fertilizer,500,kg/ha,2",
            f"North field,{day}T12:00:00+00:00,Compost,fertiliser,500,kg/ha,120",
        ],
        "+06:30",
    )
    assert (out["stored"], out["duplicate"], out["assumed_time"]) == (2, 1, 1)
    assert [r["line"] for r in out["rejected"]] == [4, 5, 7]
    assert "not in the contract" in out["rejected"][0]["reason"]
    assert "kind must be spray or fertiliser" in out["rejected"][1]["reason"]
    assert "n_pct" in out["rejected"][2]["reason"]
    stored = {r["product"]: r for r in onboard._INPUTS.items("input")}
    assert stored["Neem oil"]["time_known"] and stored["Neem oil"]["rate_unit"] == "L/ha"
    assert not stored["Compost"]["time_known"] and stored["Compost"]["kind"] == "fertiliser"
    kinds = [e["kind"] for e in get_ledger(get_settings().ledger_path).entries()]
    assert kinds.count("input_logged") == 2


def test_audit_flags_unsafe_hours_and_banned_products(tmp_path: Path):
    register(tmp_path, organic=True)
    windy, calm, quiet, banned = (day_ago(n).isoformat() for n in (9, 8, 7, 6))
    log_inputs(
        tmp_path,
        [
            f"North field,{windy}T10:00:00+00:00,Neem oil,spray,,,",
            f"North field,{calm}T10:00:00+00:00,Neem oil,spray,,,",
            f"North field,{quiet},Neem oil,spray,,,",
            f"North field,{banned}T09:00:00+00:00,Urea 46%,fertiliser,,,",
        ],
        "+00:00",
    )
    out = onboard.audit_inputs(FARM, weather(windy))
    assert out["status"] == "OK" and out["standard"] == "ASOA_ORGANIC"
    by_day = {a["applied_at"][:10]: a for a in out["applications"]}
    assert any("unsafe weather" in f for f in by_day[windy]["flags"])
    assert by_day[windy]["weather"]["wind_ms"] == 7.0
    assert by_day[calm]["flags"] == [] and by_day[calm]["weather"]["failure"] is None
    assert by_day[quiet]["weather"]["time_known"] is False
    assert by_day[quiet]["weather"]["safe_daylight_hours"] > 0
    assert by_day[banned]["flags"] == [
        "Urea 46% is not allowed under ASOA_ORGANIC (synthetic_urea)"
    ]
    assert out["flagged"] == 2 and [m["field"] for m in out["missing"]] == ["North-field.nitrogen"]


def test_audit_flags_nitrogen_past_the_contract_cap(tmp_path: Path):
    register(tmp_path, organic=True)
    log_inputs(tmp_path, [nitrogen_row(8), nitrogen_row(4)])
    out = onboard.audit_inputs(FARM, weather())
    first, second = out["applications"]
    assert first["flags"] == []
    assert second["flags"] == ["nitrogen 92.0 kg/ha passes the contract cap of 85.0 kg/ha"]
    assert out["nitrogen_kg_ha"] == {"North-field": 92.0}


def test_audit_without_a_declared_cap_says_so(tmp_path: Path):
    register(tmp_path)
    log_inputs(tmp_path, [nitrogen_row(3, "Compost")])
    out = onboard.audit_inputs(FARM, weather())
    assert out["applications"][0]["flags"] == []
    assert out["missing"] == [
        {"field": "nitrogen_cap", "reason": "contract declares no nitrogen cap"}
    ]


def test_audit_names_fertiliser_records_it_could_not_count(tmp_path: Path):
    register(tmp_path, organic=True)
    day = day_ago(5).isoformat()
    log_inputs(
        tmp_path,
        [
            nitrogen_row(8),
            f"North field,{day}T09:00:00+00:00,Compost,fertiliser,,,",
            f"North field,{day}T10:00:00+00:00,Fish emulsion,fertiliser,2,L/ha,5",
        ],
    )
    out = onboard.audit_inputs(FARM, weather())
    assert out["nitrogen_kg_ha"] == {"North-field": 46.0}
    assert out["nitrogen_uncounted"] == {"North-field": 2}
    assert out["missing"] == [
        {
            "field": "North-field.nitrogen",
            "reason": "2 fertiliser records not counted (1 without a rate or n_pct, "
            "1 with a rate not in kg/ha); the total is a lower bound",
        }
    ]
    report = onboard.to_markdown(onboard.farm_check(FARM, weather()))
    assert (
        "Nitrogen applied to North-field: 46.0 kg/ha or more (a lower bound), "
        "2 fertiliser records could not be counted" in report
    )


def test_audit_sums_nitrogen_from_the_planting_date(tmp_path: Path):
    register(tmp_path, planted=day_ago(30).isoformat())
    log_inputs(tmp_path, [nitrogen_row(60), nitrogen_row(40), nitrogen_row(8)])
    out = onboard.audit_inputs(FARM, weather())
    assert out["nitrogen_kg_ha"] == {"North-field": 92.0}
    assert not any(m["field"].endswith(".planted") for m in out["missing"])


def test_audit_without_a_planting_date_sums_every_season_and_says_so(tmp_path: Path):
    register(tmp_path, planted="")
    log_inputs(tmp_path, [nitrogen_row(60), nitrogen_row(8)])
    out = onboard.audit_inputs(FARM, weather())
    assert out["nitrogen_kg_ha"] == {"North-field": 92.0}
    assert {
        "field": "North-field.planted",
        "reason": "no planting date; nitrogen sums the fertiliser records of every season",
    } in out["missing"]


def test_banned_check_matches_whole_words_only(tmp_path: Path):
    register(tmp_path, organic=True)
    day = day_ago(5).isoformat()
    log_inputs(
        tmp_path,
        [
            f"North field,{day}T09:00:00+00:00,Urease inhibitor,fertiliser,,,",
            f"North field,{day}T10:00:00+00:00,Bio-herbicide,spray,,,",
            f"North field,{day}T11:00:00+00:00,Glyphosate 41% SL,spray,,,",
            f"North field,{day}T12:00:00+00:00,Urea 46%,fertiliser,,,",
        ],
    )
    flags = {
        a["product"]: a["flags"] for a in onboard.audit_inputs(FARM, weather())["applications"]
    }
    assert flags["Urease inhibitor"] == [] and flags["Bio-herbicide"] == []
    assert flags["Glyphosate 41% SL"] == [
        "Glyphosate 41% SL is not allowed under ASOA_ORGANIC (glyphosate)"
    ]
    assert flags["Urea 46%"] == ["Urea 46% is not allowed under ASOA_ORGANIC (synthetic_urea)"]


def test_natural_words_never_clear_a_banned_compound(tmp_path: Path):
    register(tmp_path, organic=True)
    day = day_ago(5).isoformat()
    products = ["Organic urea 46%", "Bio-Urea", "Natural urea", "Botanical pyrethroids"]
    log_inputs(
        tmp_path,
        [
            f"North field,{day}T{9 + n:02d}:00:00+00:00,{product},spray,,,"
            for n, product in enumerate(products)
        ],
    )
    flags = {
        a["product"]: a["flags"] for a in onboard.audit_inputs(FARM, weather())["applications"]
    }
    assert flags["Organic urea 46%"] == [
        "Organic urea 46% is not allowed under ASOA_ORGANIC (synthetic_urea)"
    ]
    assert flags["Bio-Urea"] == ["Bio-Urea is not allowed under ASOA_ORGANIC (synthetic_urea)"]
    assert all(flags[p] for p in products)


def test_banned_check_matches_singular_and_plural(tmp_path: Path):
    register(tmp_path, organic=True)
    day = day_ago(5).isoformat()
    log_inputs(
        tmp_path,
        [
            f"North field,{day}T09:00:00+00:00,Pyrethroid 5% EC,spray,,,",
            f"North field,{day}T10:00:00+00:00,Herbicides,spray,,,",
        ],
    )
    flags = {
        a["product"]: a["flags"] for a in onboard.audit_inputs(FARM, weather())["applications"]
    }
    assert flags["Pyrethroid 5% EC"] == [
        "Pyrethroid 5% EC is not allowed under ASOA_ORGANIC (synthetic_pyrethroids)"
    ]
    assert flags["Herbicides"] == [
        "Herbicides is not allowed under ASOA_ORGANIC (synthetic_herbicide)"
    ]


def test_report_states_the_limits_of_the_banned_input_check(tmp_path: Path):
    register(tmp_path, standard="JAS_ORGANIC")
    log_inputs(tmp_path, [f"North field,{day_ago(5).isoformat()},Glyphosate,spray,,,"], "+00:00")
    check = onboard.farm_check(FARM, weather())
    assert check["inputs"]["banned_checked"] is False
    assert check["inputs"]["applications"][0]["flags"] == []
    report = onboard.to_markdown(check)
    assert "No banned-input check ran: AgriQill has no list for JAS_ORGANIC." in report
    assert "Inputs are matched by product name only" in report


def test_audit_without_weather_still_checks_products(tmp_path: Path):
    register(tmp_path, organic=True)
    log_inputs(
        tmp_path, [f"North field,{day_ago(3).isoformat()}T09:00,Glyphosate,spray,,,"], "+00:00"
    )
    down = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(500)))
    out = onboard.audit_inputs(FARM, down)
    assert out["status"] == "NO_WEATHER" and out["weather"] is None
    assert out["applications"][0]["weather"] is None and out["flagged"] == 1
    assert "archive unavailable" in out["missing"][0]["reason"]


def test_date_only_spray_on_a_windy_day_has_no_safe_hour(tmp_path: Path):
    register(tmp_path)
    windy = day_ago(5).isoformat()
    log_inputs(tmp_path, [f"North field,{windy},Neem oil,spray,,,"], "+00:00")
    app = onboard.audit_inputs(FARM, weather(windy))["applications"][0]
    assert app["weather"] == {"safe_daylight_hours": 0, "time_known": False}
    assert app["flags"] == ["no safe spraying hour that day"]


def test_report_dates_a_record_in_local_time(tmp_path: Path):
    register(tmp_path, organic=True)
    day = day_ago(5).isoformat()
    log_inputs(tmp_path, [f"North field,{day}T05:30:00+06:30,Glyphosate,spray,,,"])
    down = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(500)))
    offline = onboard.audit_inputs(FARM, down)
    assert offline["applications"][0]["local_time"] is None
    check = onboard.farm_check(FARM, weather(utc_offset_s=23400))
    assert check["inputs"]["applications"][0]["applied_at"].startswith(f"{day_ago(6)}T23:00")
    assert f"- {day} 05:30 North-field Glyphosate" in onboard.to_markdown(check)
    check["inputs"] = offline
    assert f"- {day_ago(6)} 23:00 UTC North-field Glyphosate" in onboard.to_markdown(check)


def test_audit_without_inputs_is_null_with_reason(tmp_path: Path):
    register(tmp_path)
    out = onboard.audit_inputs(FARM, weather())
    assert out["status"] == "NO_INPUTS" and out["applications"] == []
    assert "import the inputs sheet" in out["missing"][0]["reason"]
    with pytest.raises(KeyError):
        onboard.audit_inputs("no_such_farm", weather())


def test_spray_history_counts_days_without_a_safe_hour(tmp_path: Path):
    register(tmp_path)
    windy = day_ago(5).isoformat()
    out = onboard.spray_history(FARM, 30, weather(windy))
    assert out["status"] == "OK" and out["days"] == 30
    assert out["days_without_safe_hour"] == 1 and out["closed_days"] == [windy]
    assert out["period"] == {"start": day_ago(30).isoformat(), "end": day_ago(1).isoformat()}


def test_farm_check_report_covers_recent_sprays_and_records(tmp_path: Path):
    register(tmp_path, organic=True)
    log_inputs(tmp_path, [nitrogen_row(3, "Urea 46%")])
    report = onboard.to_markdown(onboard.farm_check(FARM, weather()))
    assert "## 2. Spray safety, last 30 days" in report
    assert "## 3. Your spray and fertiliser records" in report
    assert "1 record, 1 flagged." in report and "synthetic_urea" in report
    assert "Nitrogen applied to North-field: 46.0 kg/ha" in report
    assert "## 5. Proof" in report


def test_farm_check_report_without_records_says_so(tmp_path: Path):
    register(tmp_path)
    report = onboard.to_markdown(onboard.farm_check(FARM, weather()))
    assert "last 30 days" in report and "No records imported." in report


def test_check_route_returns_the_three_sections_without_pairs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    register(tmp_path)
    base = datetime.now(UTC) - timedelta(days=4)
    sheet = write(
        tmp_path / "r.csv",
        "field,observed_at,water_depth_cm\n"
        f"North field,{base.isoformat(timespec='seconds')},5.0\n"
        f"North field,{(base + timedelta(days=1)).isoformat(timespec='seconds')},4.2\n",
    )
    onboard.import_readings(FARM, sheet, reporter="Team")
    archive = onboard.weather.fetch_archive_hourly
    monkeypatch.setattr(
        onboard.weather,
        "fetch_archive_hourly",
        lambda lat, lon, start, end, client=None: archive(lat, lon, start, end, weather()),
    )
    http = TestClient(create_app())
    out = http.get(f"/api/v1/agriquill/contracts/{FARM}/check")
    assert out.status_code == 200
    body = out.json()
    assert {"farm_id", "backtest", "spray_recent", "inputs"} <= body.keys()
    assert body["backtest"]["status"] == "OK" and body["backtest"]["fields"]
    assert all("pairs" not in f for f in body["backtest"]["fields"])
    assert http.get("/api/v1/agriquill/contracts/no_such_farm/check").status_code == 404


def test_check_route_needs_the_access_code_once_users_are_set(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    register(tmp_path)
    archive = onboard.weather.fetch_archive_hourly
    monkeypatch.setattr(
        onboard.weather,
        "fetch_archive_hourly",
        lambda lat, lon, start, end, client=None: archive(lat, lon, start, end, weather()),
    )
    settings = get_settings()
    settings.users = SecretStr(
        f"TestUser:test-code-1:crew,manager; Own:own-code:crew:{FARM}; Other:other-code:crew:farm_b"
    )
    try:
        http = TestClient(create_app())
        url = f"/api/v1/agriquill/contracts/{FARM}/check"
        assert http.get(url).status_code == 401
        assert http.get(url, headers={"X-AgriQuill-Write-Token": "nope"}).status_code == 401
        right = http.get(url, headers={"X-AgriQuill-Write-Token": "test-code-1"})
        assert right.status_code == 200 and right.json()["farm_id"] == FARM
        own = http.get(url, headers={"X-AgriQuill-Write-Token": "own-code"})
        assert own.status_code == 200
        other = http.get(url, headers={"X-AgriQuill-Write-Token": "other-code"})
        assert other.status_code == 403 and FARM in other.json()["detail"]
    finally:
        settings.users = None


def test_mcp_dashboard_tools_are_read_only(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    register(tmp_path)
    tools = server.select_tools(False)
    assert {"farm_summary", "farm_records_check", "proposals_list"} <= tools.keys()
    assert all(
        tools[n]["description"].startswith("Read-only.")
        for n in ("farm_summary", "farm_records_check", "proposals_list")
    )
    hourly = onboard.weather.fetch_hourly
    archive = onboard.weather.fetch_archive_hourly
    monkeypatch.setattr(
        onboard.weather,
        "fetch_hourly",
        lambda lat, lon, past, ahead, client=None: hourly(lat, lon, past, ahead, weather()),
    )
    monkeypatch.setattr(
        onboard.weather,
        "fetch_archive_hourly",
        lambda lat, lon, start, end, client=None: archive(lat, lon, start, end, weather()),
    )
    ledger = get_ledger(get_settings().ledger_path)
    before = len(ledger.entries())
    summary = server.handle(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": "farm_summary", "arguments": {"farm_id": FARM}},
        },
        tools,
    )
    assert summary["result"]["isError"] is False
    assert json.loads(summary["result"]["content"][0]["text"])["farm_id"] == FARM
    check = tools["farm_records_check"]["fn"]({"farm_id": FARM})
    assert {"farm_id", "backtest", "spray_recent", "inputs"} <= check.keys()
    assert tools["proposals_list"]["fn"]({"farm_id": FARM}) == {"proposals": []}
    assert tools["proposals_list"]["fn"]({}) == {"proposals": []}
    added = ledger.entries()[before:]
    assert {e["kind"] for e in added} <= {"evidence_fetch"}
    for name in ("farm_summary", "farm_records_check"):
        assert tools[name]["fn"]({"farm_id": "no_such_farm"}) == {
            "error": "no contract for this farm"
        }


def test_cli_onboard_logs_inputs(tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    fields = write(tmp_path / "fields.csv", "field,lat,lon,area\nPlot A,16.72,95.59,1.5\n")
    inputs = write(
        tmp_path / "inputs.csv",
        "field,date,product,kind\n"
        "Plot A,2026-08-01,Neem oil,spray\n"
        "Plot B,2026-08-01,Neem oil,spray\n",
    )
    code = cli.main(
        [
            "onboard",
            "--farm-id",
            FARM,
            "--name",
            "Plot farm",
            "--country",
            "MM",
            "--fields",
            str(fields),
            "--inputs",
            str(inputs),
            "--utc-offset",
            "+06:30",
            "--by",
            "Tester",
        ]
    )
    printed = capsys.readouterr().out
    assert code == 0
    assert "inputs: 1 stored, 0 already there, 1 rejected, 1 dated without a time" in printed
    assert "line 3: field 'Plot B' is not in the contract" in printed


def test_cli_onboard_registers_and_prints_links(tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    fields = write(tmp_path / "fields.csv", "field,lat,lon,area\nPlot A,16.72,95.59,1.5\n")
    code = cli.main(
        [
            "onboard",
            "--farm-id",
            FARM,
            "--name",
            "Plot farm",
            "--country",
            "MM",
            "--fields",
            str(fields),
            "--by",
            "Tester",
        ]
    )
    printed = capsys.readouterr().out
    assert code == 0 and "PASS     contract" in printed and f"?farm={FARM}" in printed
    assert live.load(FARM) is not None
