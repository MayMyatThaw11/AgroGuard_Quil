import json
import re
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import pytest

from agriquill import jobs, live, onboard, safety, store, telemetry
from agriquill.config import get_settings
from agriquill.data import regions, weather
from agriquill.mcp import server, tools

FARM = "trial_farm"
FIELD = "North-field"
SQUARE = [[95.59, 16.728], [95.591, 16.728], [95.591, 16.729], [95.59, 16.729], [95.59, 16.728]]
FARM_TOOLS = (
    "ops_plan_live_preview",
    "field_monitoring_status",
    "farm_summary",
    "farm_records_check",
    "farm_location",
)


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


def open_meteo(et0: float = 0.6) -> httpx.Client:
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
            "utc_offset_seconds": 0,
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
                "wind_speed_10m": [2.0] * n,
                "wind_gusts_10m": [3.0] * n,
                "et0_fao_evapotranspiration": [et0 if 6 <= i % 24 <= 18 else 0.0 for i in range(n)],
                "is_day": [1 if 6 <= i % 24 <= 18 else 0 for i in range(n)],
            },
        }
        return httpx.Response(200, content=json.dumps(body).encode())

    return httpx.Client(transport=httpx.MockTransport(handler))


@pytest.fixture
def mocked_weather(monkeypatch: pytest.MonkeyPatch) -> None:
    hourly, archive = weather.fetch_hourly, weather.fetch_archive_hourly
    monkeypatch.setattr(
        weather,
        "fetch_hourly",
        lambda lat, lon, past, ahead, client=None: hourly(lat, lon, past, ahead, open_meteo()),
    )
    monkeypatch.setattr(
        weather,
        "fetch_archive_hourly",
        lambda lat, lon, start, end, client=None: archive(lat, lon, start, end, open_meteo()),
    )


def register(tmp_path: Path, standard: str | None = None) -> None:
    sheet = tmp_path / "fields.csv"
    planted = (datetime.now(UTC).date() - timedelta(days=40)).isoformat()
    sheet.write_text(
        "field,crop,variety,planted,stage,area,area_unit\n"
        f"North field,rice_lowland,Paw San Hmwe,{planted},Tillering,2.9,acre\n",
        encoding="utf-8",
    )
    fields = onboard.read_fields(sheet)
    rings = {FIELD: onboard._ring(SQUARE)}
    text, _ = onboard.build_contract(
        FARM, "Daw Hla's farm", "MM", fields, rings, "test files", standard
    )
    live.register(FARM, text, "tester")


def tube(value: float, hours_ago: float = 2) -> None:
    stamp = (datetime.now(UTC) - timedelta(hours=hours_ago)).isoformat(timespec="seconds")
    device = onboard.device_for(FARM, FIELD)
    telemetry.ingest(device, stamp, {"water_depth_cm": value}, "manual", "tester")


def call(name: str, arguments: dict) -> dict:
    out = server.handle(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        },
        server.select_tools(False),
    )
    assert out is not None and out["result"]["isError"] is False, out
    return json.loads(out["result"]["content"][0]["text"])


@pytest.mark.usefixtures("mocked_weather")
def test_every_farm_tool_answers_for_the_customer_farm(tmp_path: Path):
    register(tmp_path)
    tube(-14.0)
    live.watch(FARM, open_meteo())
    live.watch("farm_ayeyarwady_demo", open_meteo())
    for name in FARM_TOOLS:
        assert call(name, {"farm_id": FARM})["farm_id"] == FARM, name

    plan = call("ops_plan_live_preview", {"farm_id": FARM})
    assert plan["status"] == "OK"
    assert [p["id"] for p in plan["paddies"]] == [FIELD]
    status = call("field_monitoring_status", {"farm_id": FARM})
    assert [p["id"] for p in status["paddies"]] == [FIELD]
    assert status["paddies"][0]["model"]["depth_cm"] is not None
    summary = call("farm_summary", {"farm_id": FARM})
    assert summary["contract"]["standard"] is None
    assert summary["proposals"]["open"] >= 1

    spec = live.load(FARM)[1]["contract"]
    where = call("farm_location", {"farm_id": FARM})
    assert where["location"] == spec["farm"]["location"]
    assert where["country"] == "MM"
    area = spec["parcels"][0]["area_ha"]
    assert where["parcels"] == [{"id": FIELD, "area_ha": area, "has_outline": True}]

    rows = call("proposals_list", {"farm_id": FARM})["proposals"]
    assert rows and {r["farm_id"] for r in rows} == {FARM}
    missing = {"error": "no contract for this farm"}
    assert call("farm_location", {"farm_id": "nobody_farm"}) == missing


def test_region_tools_say_plainly_they_cover_demo_towns_only(tmp_path: Path):
    register(tmp_path)
    region = call("farm_region_data", {"farm_id": FARM})
    assert regions.DEMO_ONLY in region["missing"][0]["reason"]
    town = call("farm_region_data", {"town": "Nowhere-on-the-map"})
    assert regions.DEMO_ONLY in town["missing"][0]["reason"]
    crops = call("crop_options", {"town": "Nowhere-on-the-map"})
    assert crops["options"] == [] and regions.DEMO_ONLY in crops["missing"][0]["reason"]


def test_farm_location_is_read_only_and_not_an_actuation_tool():
    assert "farm_location" in server.READ_ONLY_TOOLS
    assert tools.TOOLS["farm_location"]["description"].startswith("Read-only.")


@pytest.mark.usefixtures("mocked_weather")
def test_proposals_quote_the_numbers_of_the_plan_they_came_from(tmp_path: Path):
    register(tmp_path)
    tube(-14.0)
    result = live.watch(FARM, open_meteo())
    current = result["live"]
    tasks = {t["id"]: t for t in current["tasks"]}
    paddies = {p["id"]: p for p in current["paddies"]}
    thresholds = current["thresholds"]
    actuated = [p for p in result["proposals"] if p["task"].get("actuation")]
    assert actuated, [t["title"] for t in current["tasks"]]
    rain_72h = round(sum(d["rain_mm"] for d in current["weather"]["days"][:3]), 1)
    for proposal in actuated:
        task = tasks[proposal["task"]["id"]]
        paddy = paddies[task["paddy_id"]]
        assert proposal["depth"] == paddy
        assert proposal["evidence"] == task["evidence"]
        assert proposal["schedule"] == task["schedule"]
        assert f"at {paddy['now']} cm" in proposal["text"]
        assert proposal["text"].endswith(f"; {rain_72h} mm rain forecast for 72 h")
        p50 = current["forecast_series"][task["paddy_id"]]["p50"]
        for line in task["evidence"]:
            found = re.fullmatch(r"p50 day (\d+): (-?[\d.]+) cm", line)
            if found:
                assert float(found.group(2)) == round(p50[int(found.group(1)) - 1], 1)
            found = re.fullmatch(r"floor (-?\d+) cm \((\w+)\)", line)
            if found:
                assert int(found.group(1)) == round(thresholds["awd_safe_depth_cm"])
            found = re.fullmatch(r"estimated volume (\d+) m3", line)
            if found:
                target = thresholds["awd_reflood_target_cm"]
                lift = max(target - p50[task["day_offset"]], 0.0)
                area = live.load(FARM)[1]["contract"]["parcels"][0]["area_ha"]
                assert int(found.group(1)) == round(area * 10_000 * lift / 100)
        if task["title"].startswith("Re-flood"):
            assert f"no pump registered for {FIELD}" in task["evidence"]
    monitored = live.monitoring(FARM, current=current)["paddies"][0]["model"]
    assert monitored["depth_cm"] == paddies[FIELD]["now"]
    assert monitored["sigma_cm"] == paddies[FIELD]["sigma_cm"]


def test_contract_watch_keeps_going_when_one_farm_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    register(tmp_path)
    seen: list[str] = []

    def watch(farm_id: str) -> dict:
        seen.append(farm_id)
        if farm_id == "farm_ayeyarwady_demo":
            raise RuntimeError("weather store locked")
        return {"live": {"status": "OK"}, "proposals": []}

    monkeypatch.setattr(live, "watch", watch)
    out = jobs._contract_watch()
    assert set(seen) == {"farm_ayeyarwady_demo", FARM}
    assert out["farm_ayeyarwady_demo"] == {
        "status": "FAILED",
        "error": "RuntimeError: weather store locked",
    }
    assert out[FARM] == {"status": "OK", "proposals": 0}


def _approve(standard: str | None, inputs: list[str] | None = None) -> dict:
    first = safety.evaluate_actuation(
        "irrigation_valve", declared_inputs=inputs, standard=standard, requested_minutes=30
    )
    if first["status"] != "PENDING_APPROVAL":
        return first
    return safety.evaluate_actuation(
        "irrigation_valve",
        declared_inputs=inputs,
        standard=standard,
        requested_minutes=30,
        approval_pin="1234",
        operator_confirmed=True,
        challenge_token=first["challenge_token"],
    )


@pytest.mark.parametrize("standard", [None, "", "none declared", "None Declared"])
def test_a_farm_without_a_standard_can_still_actuate_through_every_other_gate(standard):
    out = _approve(standard)
    assert out["status"] == "PERMITTED", out
    assert out["notes"] == []
    assert "gate3_challenge_token_verified" in out["gatesPassed"]
    windy = safety.evaluate_actuation("drone", wind_speed_ms=5.6, standard=standard)
    assert windy["failure"]["code"] == "REJECTED_WIND_EXCEEDED"
    no_pin = safety.evaluate_actuation(
        "irrigation_valve", standard=standard, requested_minutes=30, operator_confirmed=True
    )
    assert no_pin["status"] == "REJECTED"


def test_an_unlisted_standard_actuates_but_says_its_inputs_were_not_checked():
    out = _approve("GLOBALGAP_IFA_V6", ["synthetic_urea"])
    assert out["status"] == "PERMITTED"
    assert "no list for GLOBALGAP_IFA_V6" in out["notes"][0]
    assert "TO VERIFY" in out["notes"][0]


@pytest.mark.parametrize("standard", ["ASEAN_ORGANIC_ASOA", "ASOA_ORGANIC", "ASOA_ORGANIC_V2"])
def test_asoa_and_its_aliases_still_block_synthetic_urea(standard):
    out = _approve(standard, ["synthetic_urea"])
    assert out["status"] == "REJECTED"
    assert out["failure"]["code"] == "REJECTED_PROHIBITED_INPUT"
