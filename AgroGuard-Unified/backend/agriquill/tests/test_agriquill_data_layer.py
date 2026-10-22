import asyncio
import io
import json
import math
from collections.abc import Callable, Iterator
from datetime import date
from pathlib import Path
from typing import Any

import h5py
import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import SecretStr

from agriquill import agronomy, jobs, knowledge, resilience, store, twin
from agriquill.api.main import create_app
from agriquill.config import KEYS_FILE, Settings, get_settings
from agriquill.data import (
    chirps,
    fao_pack,
    farm_sites,
    gfw_forest,
    gfw_marine,
    gleam,
    nasapower,
    regions,
    soil,
)
from agriquill.mcp.server import handle, select_tools
from agriquill.resilience import Breaker, CircuitOpen, retry

DATA = Path(__file__).parent / "data"
HEADER = (DATA / "chirps_2024_07_header.bin").read_bytes()
YANGON = (16.8, 96.1)


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[Path]:
    settings = get_settings()
    saved = (
        settings.data_dir,
        settings.ledger_path,
        settings.knowledge_root,
        settings.faostat_token,
    )
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.faostat_token = None
    chirps._HOT.clear()
    gfw_forest._HOT.clear()
    resilience.BASE_S = 0.0
    for breaker in (gfw_forest._BREAKER, gfw_marine._BREAKER, gleam._BREAKER):
        breaker.reset()
    knowledge._CHECKED.clear()
    yield tmp_path
    store.close_all()
    settings.data_dir, settings.ledger_path, settings.knowledge_root, settings.faostat_token = saved


def mock(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def lzw_tile(value: float, row: int, col: int, size: int = 512) -> bytes:
    grid = np.zeros((size, size), dtype="<f4")
    grid[row, col] = value
    buf = io.BytesIO()
    Image.fromarray(grid).save(buf, format="TIFF", compression="tiff_lzw", tiffinfo={278: size})
    image = Image.open(io.BytesIO(buf.getvalue()))
    start, length = image.tag_v2[273][0], image.tag_v2[279][0]
    return buf.getvalue()[start : start + length]


def numbers_have_source(out: dict[str, Any]) -> bool:
    def numbers(node: Any) -> bool:
        if isinstance(node, bool):
            return False
        if isinstance(node, int | float):
            return True
        if isinstance(node, dict):
            return any(numbers(v) for k, v in node.items() if k not in ("location", "cell", "rank"))
        if isinstance(node, list):
            return any(numbers(v) for v in node)
        return False

    payload = {k: v for k, v in out.items() if k in ("days", "series", "records", "entries")}
    if not numbers(payload):
        return True
    source = out.get("source") or {}
    return str(source.get("sha256", "")).startswith("sha256:") and bool(source.get("url"))


def test_lzw_decoder_matches_an_independent_encoder() -> None:
    grid = np.arange(64 * 64, dtype="<f4").reshape(64, 64)
    buf = io.BytesIO()
    Image.fromarray(grid).save(buf, format="TIFF", compression="tiff_lzw", tiffinfo={278: 64})
    image = Image.open(io.BytesIO(buf.getvalue()))
    start, length = image.tag_v2[273][0], image.tag_v2[279][0]
    assert chirps.lzw_decode(buf.getvalue()[start : start + length]) == grid.tobytes()


def test_chirps_header_from_the_real_cog_maps_yangon_to_its_cell() -> None:
    tags = chirps.parse_header(HEADER)
    assert (tags["width"], tags["height"], tags["compression"]) == (7200, 2000, 5)
    assert len(tags["tile_offsets"]) == 60
    assert chirps.pixel_of(tags, *YANGON) == (663, 5521)
    with pytest.raises(chirps.ChirpsError):
        chirps.pixel_of(tags, 60.0, 10.0)


def chirps_server(tile: bytes | None, status: int = 206) -> httpx.Client:
    tags = chirps.parse_header(HEADER)
    index = (663 // 512) * 15 + 5521 // 512
    size = tags["tile_bytes"][index]

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/cogs/"):
            return httpx.Response(200, text='<a href="chirps-v2.0.2024.08.cog">x</a>')
        start = int(request.headers["range"].split("=")[1].split("-")[0])
        if start == 0:
            return httpx.Response(206, content=HEADER)
        if tile is None:
            return httpx.Response(status)
        return httpx.Response(206, content=tile.ljust(size, b"\x00"))

    return mock(handle)


def test_chirps_reads_the_cell_value_and_caches_it_forever() -> None:
    client = chirps_server(lzw_tile(42.5, 663 % 512, 5521 % 512))
    out = chirps.rainfall(*YANGON, date(2024, 7, 1), date(2024, 7, 31), client=client)
    assert out["series"] == [{"period": "2024-07", "precip_mm": 42.5}]
    assert out["cell"] == {"row": 663, "col": 5521, "resolution_deg": 0.05}
    assert numbers_have_source(out)
    offline = chirps_server(None, 504)
    again = chirps.rainfall(*YANGON, date(2024, 7, 1), date(2024, 7, 31), client=offline)
    assert again["series"][0]["precip_mm"] == 42.5


def test_chirps_outage_gives_null_with_reason_not_a_number() -> None:
    down = chirps_server(None, 504)
    out = chirps.rainfall(*YANGON, date(2024, 6, 1), date(2024, 6, 30), client=down)
    assert out["series"] == [{"period": "2024-06", "precip_mm": None}]
    assert out["missing"] == [{"field": "2024-06", "reason": "HTTP 504"}]
    assert out["source"] is None


def test_chirps_truncated_tile_is_refused() -> None:
    tags = chirps.parse_header(HEADER)
    with pytest.raises(chirps.ChirpsError):
        chirps.value_from_tile(tags, b"\x80\x00", 663, 5521)


def test_chirps_statistics_need_a_full_baseline() -> None:
    rng = np.random.default_rng(7)
    series = [
        {"period": f"{y}-{m:02d}", "precip_mm": float(rng.gamma(2.0, 80.0))}
        for y in range(1991, 2025)
        for m in range(1, 13)
    ]
    stats = chirps.statistics(series)
    assert stats["latest_period"] == "2024-12"
    assert 0 <= stats["latest_percentile"] <= 100
    assert math.isfinite(stats["spi3"])
    short = chirps.statistics(series[-24:])
    assert short["spi3"] is None and "baseline" in short["reason"]


def _monthly(values: dict[tuple[int, int], float]) -> list[dict]:
    return [{"period": f"{y}-{m:02d}", "precip_mm": v} for (y, m), v in sorted(values.items())]


def test_spi_follows_the_wmo_gamma_mixed_distribution_on_reference_cases() -> None:
    from scipy import stats as st

    rng = np.random.default_rng(3)
    years = range(1991, 2021)
    totals = {(y, 7): float(v) for y, v in zip(years, rng.gamma(2.0, 80.0, 30), strict=True)}
    wet = dict(totals)
    wet[(2021, 7)] = float(st.gamma.ppf(st.norm.cdf(2.0), 2.0, scale=80.0))
    assert abs(chirps.spi(_monthly(wet), 7, 1) - 2.0) < 0.35
    median = dict(totals)
    median[(2021, 7)] = float(np.median(list(totals.values())))
    assert abs(chirps.spi(_monthly(median), 7, 1)) < 0.1
    dry = {k: (0.0 if i < 6 else v) for i, (k, v) in enumerate(totals.items())}
    dry[(2021, 7)] = 0.0
    assert chirps.spi(_monthly(dry), 7, 1) == pytest.approx(float(st.norm.ppf(0.2)), abs=0.01)


def test_spi_scales_sum_the_right_number_of_months() -> None:
    rng = np.random.default_rng(5)
    series = _monthly(
        {(y, m): float(rng.gamma(2.0, 60.0)) for y in range(1991, 2022) for m in range(1, 13)}
    )
    assert chirps.spi3(series, 6) == chirps.spi(series, 6, 3)
    values = [chirps.spi(series, 6, k) for k in chirps.SPI_SCALES]
    assert all(v is not None and math.isfinite(v) for v in values)
    assert len(set(values)) == 3
    stats = chirps.statistics(series)
    assert {"spi1", "spi3", "spi6"} <= set(stats)


def test_harvest_rain_reports_nov_to_jan_odds_from_the_baseline() -> None:
    values = {}
    for i, y in enumerate(range(1991, 2021)):
        for m in range(1, 13):
            values[(y, m)] = 100.0
        values[(y, 11)] = 40.0 if i < 9 else 5.0
        values[(y, 12)] = 2.0
        values[(y, 1)] = 0.0
    out = chirps.harvest_rain(_monthly(values))
    nov = next(m for m in out["months"] if m["month"] == 11)
    assert nov["years"] == 30 and nov["chance_at_or_above"] == 0.3
    assert out["threshold_mm"] == chirps.HARVEST_RAIN_MM
    assert "TO VERIFY" in out["threshold_status"]
    short = chirps.harvest_rain(_monthly({(2020, 11): 3.0}))
    assert short["months"] == [] and "baseline" in short["reason"]


def power_server(status: int = 200, fill: bool = False) -> httpx.Client:
    raw = json.loads((DATA / "nasapower_yangon_20240101.json").read_text(encoding="utf-8"))
    if fill:
        raw["properties"]["parameter"]["WS2M"]["20240102"] = -999.0

    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json=raw if status == 200 else {"detail": "down"})

    return mock(handle)


def test_nasa_power_parses_units_and_turns_fill_values_into_null() -> None:
    out = nasapower.daily(*YANGON, date(2024, 1, 1), date(2024, 1, 3), power_server(fill=True))
    assert out["parameters"]["WS2M"]["units"] == "m/s"
    assert out["days"][0]["T2M_MAX"] == 32.88
    assert out["days"][1]["WS2M"] is None
    assert any(m["field"] == "WS2M@2024-01-02" for m in out["missing"])
    assert out["elevation_m"] == pytest.approx(10.91)
    assert numbers_have_source(out)


def test_nasa_power_outage_without_cache_is_empty_with_reason() -> None:
    out = nasapower.daily(*YANGON, date(2024, 1, 1), date(2024, 1, 3), power_server(504))
    assert out["days"] == [] and out["source"] is None
    assert "unavailable" in out["missing"][0]["reason"]


def test_nasa_power_serves_the_disk_cache_when_the_api_fails() -> None:
    nasapower.daily(*YANGON, date(2024, 1, 1), date(2024, 1, 3), power_server())
    out = nasapower.daily(*YANGON, date(2024, 1, 1), date(2024, 1, 3), power_server(504))
    assert out["days"][0]["T2M_MAX"] == 32.88


def test_fao56_matches_the_published_worked_examples() -> None:
    assert round(agronomy.extraterrestrial_radiation(math.radians(-20), 246), 1) == 32.2
    assert round(agronomy.extraterrestrial_radiation(math.radians(50.8), 187), 2) == 41.09
    eto = agronomy.fao56_eto(
        21.5,
        12.3,
        0.0,
        2.078,
        22.07,
        elevation_m=100,
        latitude_rad=math.radians(50.8),
        day_of_year=187,
        ea_kpa=1.409,
    )
    assert round(eto, 1) == 3.9


def test_et0_from_power_carries_inputs_and_method() -> None:
    out = nasapower.et0(*YANGON, date(2024, 1, 2), power_server())
    assert out["et0_mm_day"] is not None and out["et0_mm_day"] > 0
    assert out["provenance"] == "DERIVED" and "FAO-56" in out["method"]
    gap = nasapower.et0(*YANGON, date(2024, 1, 5), power_server(504))
    assert gap["et0_mm_day"] is None and gap["missing"]


def packed() -> None:
    zip_path = DATA / "faostat_qcl_slice.zip"
    fao_pack.pack_faostat(str(zip_path), store.sha256(zip_path.read_bytes()), "fixture")


def test_faostat_pack_returns_official_myanmar_rice_yield() -> None:
    assert fao_pack.faostat_qcl("MMR", "Rice")["missing"][0]["reason"].startswith("FAOSTAT is not")
    packed()
    out = fao_pack.faostat_qcl("Myanmar", "rice", "Yield", 2022, 2022)
    assert out["records"] == [
        {
            "area": "Myanmar",
            "item": "Rice",
            "item_code": 27,
            "element": "Yield",
            "year": 2022,
            "value": 3946.7,
            "unit": "kg/ha",
            "flag": "A",
            "flag_meaning": "Official figure",
        }
    ]
    assert out["provenance"] == "OFFICIAL_RECORD" and numbers_have_source(out)
    assert fao_pack.faostat_qcl("MM", "27", "Production", 2021, 2021)["records"][0]["value"] == (
        27438300.0
    )
    with pytest.raises(KeyError):
        fao_pack.faostat_qcl("France", "Rice")


def test_faostat_ambiguous_item_lists_candidates_instead_of_guessing() -> None:
    packed()
    out = fao_pack.faostat_qcl("MMR", "zz-no-such-item")
    assert out["records"] == [] and out["missing"][0]["field"] == "item"


def test_faostat_live_without_token_or_with_a_refused_token() -> None:
    no_token = fao_pack.faostat_live("MMR", "27", client=mock(lambda r: httpx.Response(200)))
    assert no_token["missing"][0]["reason"] == "no FAOSTAT token or login configured"
    get_settings().faostat_token = SecretStr("fixture-token")
    refused = fao_pack.faostat_live("MMR", "27", client=mock(lambda r: httpx.Response(401)))
    assert "HTTP 401" in refused["missing"][0]["reason"]
    rows = {
        "data": [
            {
                "Area": "Myanmar",
                "Item": "Rice",
                "Item Code": "27",
                "Element": "Yield",
                "Year": "2022",
                "Value": "3946.7",
                "Unit": "kg/ha",
                "Flag": "A",
                "Flag Description": "Official value",
            }
        ]
    }
    seen: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("authorization", ""))
        return httpx.Response(200, json=rows)

    live = fao_pack.faostat_live("MMR", "27", "Yield", 2022, 2022, client=mock(handle))
    assert live["records"][0]["value"] == 3946.7 and seen == ["Bearer fixture-token"]
    assert numbers_have_source(live)
    assert "fixture-token" not in json.dumps(live)


def test_crop_calendar_keeps_coverage_gaps_explicit() -> None:
    body = (DATA / "crop_calendar_mm.json").read_bytes()

    def handle(request: httpx.Request) -> httpx.Response:
        if "/MM/" in request.url.path:
            return httpx.Response(200, content=body)
        return httpx.Response(204)

    fao_pack.REQUEST_GAP_S = 0
    summary = fao_pack.sync_crop_calendar(["MMR", "THA"], client=mock(handle))
    assert summary == {"MMR": "covered", "THA": "not covered by FAO Crop Calendar"}
    rice = fao_pack.crop_calendar("MM", "rice")
    assert rice["entries"] and rice["entries"][0]["sessions"][0]["growing_period"]
    assert numbers_have_source(rice)
    thai = fao_pack.crop_calendar("THA")
    assert thai["entries"] == [] and thai["missing"][0]["reason"].startswith("not covered")
    assert fao_pack.crop_calendar("VNM")["missing"][0]["reason"].startswith("crop calendar not")


def test_knowledge_index_cites_lines_and_skips_private_paths(isolated: Path) -> None:
    root = isolated / "repo"
    (root / "docs").mkdir(parents=True)
    (root / "BrainAgroguard" / ".obsidian").mkdir(parents=True)
    (root / "docs" / "water.md").write_text(
        "---\ntitle: x\n---\n# Water\n\n## AWD\nKeep paddy water above -15 cm. TO VERIFY\n",
        encoding="utf-8",
    )
    (root / "BrainAgroguard" / ".obsidian" / "secret.md").write_text("paddy key", "utf-8")
    (root / "docs" / ".env.md").write_text("paddy LLM_API_KEY", encoding="utf-8")
    get_settings().knowledge_root = str(root)
    assert knowledge.build()["files"] == 1
    out = knowledge.search("paddy water")
    assert [h["cite"] for h in out["hits"]] == ["docs/water.md#L6"]
    assert out["hits"][0]["marker"] == "TO VERIFY" and out["hits"][0]["heading"] == "Water > AWD"
    assert knowledge.search('" OR 1=1 NEAR(')["hits"] == []
    assert knowledge.search("***")["missing"][0]["field"] == "query"
    assert knowledge.build() == {"rebuilt": False}


def test_jobs_run_record_failure_and_refuse_unknown_names(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom() -> dict[str, Any]:
        raise RuntimeError("x" * 500)

    monkeypatch.setitem(jobs.JOBS, "ok_job", ("fixture", lambda: {"rows": 3}))
    monkeypatch.setitem(jobs.JOBS, "bad_job", ("fixture", boom))

    async def go() -> tuple[dict[str, Any], dict[str, Any]]:
        return await jobs.run_now("ok_job"), await jobs.run_now("bad_job")

    ok, bad = asyncio.run(go())
    assert ok["status"] == "COMPLETED" and ok["result"] == {"rows": 3}
    assert bad["status"] == "FAILED" and len(bad["error"]) <= jobs.ERROR_CHARS
    assert jobs.status(ok["run_id"]) is ok
    with pytest.raises(KeyError):
        jobs.start("nope")


def test_job_and_data_routes_validate_input() -> None:
    client = TestClient(create_app())
    names = {j["name"] for j in client.get("/api/v1/agriquill/jobs").json()["jobs"]}
    assert {"faostat_sync", "crop_calendar_sync", "ecocrop_sync", "knowledge_index"} <= names
    assert client.post("/api/v1/agriquill/jobs/nope/run").status_code == 404
    assert client.get("/api/v1/agriquill/jobs/status/job_missing").status_code == 404
    bad = "/api/v1/agriquill/chirps/rainfall?lat=70&lon=96&start=2024-01-01&end=2024-02-01"
    assert client.get(bad).status_code == 422
    back = "/api/v1/agriquill/nasa-power/daily?lat=16&lon=96&start=2024-02-01&end=2024-01-01"
    assert client.get(back).status_code == 422
    assert client.get("/api/v1/agriquill/faostat/qcl?country=XX&item=Rice").status_code == 422


def test_soil_outage_returns_no_invented_layers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "soilgrids_endpoint", "http://127.0.0.1:9/none")
    monkeypatch.setattr(get_settings(), "http_timeout_s", 2.0)
    out = asyncio.run(soil.fetch_soil(1.234, 5.678))
    assert out["provider"] == "unavailable" and out["layers"] == []
    assert soil._CACHE.get(("soil", 1.234, 5.678)) is None


def test_soil_masked_point_is_null_with_a_reason() -> None:
    depths = [{"label": d, "values": {"mean": None}} for d in soil.SOIL_DEPTHS]
    layers = [
        {"name": p, "unit_measure": {"mapped_units": "g/kg"}, "depths": depths}
        for p in ["sand", "silt", "clay", "phh2o", "soc", "cec"]
    ]
    with pytest.raises(ValueError, match="no value at this point"):
        soil.parse_soil({"properties": {"layers": layers}})


def test_agents_get_the_data_tools_read_only() -> None:
    catalog = select_tools(allow_actuation=False)
    expected = {
        "faostat_qcl",
        "fao_crop_calendar",
        "chirps_rainfall",
        "nasa_power_daily",
        "et0_fao56",
        "knowledge_search",
        "jobs_status",
    }
    assert expected <= set(catalog)
    assert "lorawan_actuate" not in catalog
    packed()
    out = catalog["faostat_qcl"]["fn"]({"country": "MMR", "item": "Rice", "element": "Yield"})
    assert {r["year"] for r in out["records"]} == {2021, 2022}


def test_cached_reads_hold_up_under_concurrency_and_do_not_grow_memory() -> None:
    import tracemalloc
    from concurrent.futures import ThreadPoolExecutor

    packed()
    nasapower.daily(*YANGON, date(2024, 1, 1), date(2024, 1, 3), power_server())
    offline = power_server(504)

    def read(i: int) -> bool:
        if i % 2:
            out = fao_pack.faostat_qcl("MMR", "Rice", "Yield", 2022, 2022)
            return out["records"][0]["value"] == 3946.7
        out = nasapower.daily(*YANGON, date(2024, 1, 1), date(2024, 1, 3), offline)
        return out["days"][0]["T2M_MAX"] == 32.88

    with ThreadPoolExecutor(max_workers=32) as pool:
        assert all(pool.map(read, range(100)))
    for i in range(50):
        read(i)
    tracemalloc.start()
    for i in range(250):
        read(i)
    first = tracemalloc.get_traced_memory()[0]
    for i in range(250):
        read(i)
    second = tracemalloc.get_traced_memory()[0]
    tracemalloc.stop()
    assert second - first < 512 * 1024


def walk_sources(node: Any, path: str = "") -> Iterator[tuple[str, dict[str, Any]]]:
    if isinstance(node, dict):
        if "source" in node:
            yield path, node
        for key, value in node.items():
            yield from walk_sources(value, f"{path}/{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from walk_sources(value, f"{path}[{index}]")


def test_committed_snapshot_covers_every_farm_town_with_sourced_numbers() -> None:
    built = json.loads(regions.SNAPSHOT.read_text(encoding="utf-8"))["regions"]
    towns = {t[1] for t in twin.TOWNS}
    assert towns <= built.keys()
    for town in towns:
        entry = built[town]
        rain = entry["rainfall"]
        assert len(rain["series"]) == 12 and rain["source"]["sha256"].startswith("sha256:")
        assert rain["statistics"]["spi3"] is not None
        assert rain["statistics"]["latest_percentile"] is not None
        weather = entry["weather"]
        assert weather["summary"]["days_with_data"] > 0
        assert weather["source"]["url"].startswith("https://power.larc.nasa.gov/")
        assert entry["faostat"]["records"] and entry["faostat"]["source"]["sha256"]
        assert all(r["flag"] for r in entry["faostat"]["records"])
        for _, block in walk_sources(entry):
            assert block["source"] is None or block["source"]["retrieved_at"]


def test_snapshot_keeps_calendar_gaps_explicit() -> None:
    built = json.loads(regions.SNAPSHOT.read_text(encoding="utf-8"))["regions"]
    thailand = built["Suphan Buri"]["crop_calendar"]
    assert thailand["entries"] == [] and thailand["missing"]
    assert built["Maubin, Ayeyarwady"]["crop_calendar"]["entries"]


def test_region_reads_reject_unknown_towns_and_farms() -> None:
    client = TestClient(create_app())
    assert regions.get("Atlantis")["missing"]
    assert regions.for_farm("FM-999")["missing"]
    assert client.get("/api/v1/agriquill/regions/Atlantis").status_code == 404
    assert client.get("/api/v1/agriquill/farms/FM-999/region").status_code == 404


def test_region_routes_and_tool_return_the_same_snapshot() -> None:
    client = TestClient(create_app())
    listing = client.get("/api/v1/agriquill/regions").json()
    assert sum(r["farm_count"] for r in listing["regions"]) == len(
        twin.fixture(twin.MAX_FARMS)["farms"]
    )
    assert all(r["has_snapshot"] for r in listing["regions"])
    via_farm = client.get("/api/v1/agriquill/farms/FM-001/region").json()
    via_town = client.get("/api/v1/agriquill/regions/Maubin").json()
    assert via_farm["rainfall"] == via_town["rainfall"]
    assert "farm_region_data" in select_tools(False)
    reply = handle(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": "farm_region_data", "arguments": {"farm_id": "FM-001"}},
        }
    )
    assert reply is not None and "isError" not in json.dumps(reply)[:200]


def test_one_failing_source_leaves_that_block_null_with_a_reason(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def broken(*_: Any, **__: Any) -> dict[str, Any]:
        raise RuntimeError("CHIRPS down")

    monkeypatch.setattr(regions, "SNAPSHOT", tmp_path / "snap.json")
    monkeypatch.setattr(chirps, "assessment", broken)
    monkeypatch.setattr(regions, "_weather", lambda *a: {"summary": {"days_with_data": 1}})
    monkeypatch.setattr(regions, "_faostat", lambda *a: {"records": []})
    monkeypatch.setattr(regions, "_calendar", lambda *a: {"entries": []})
    town = regions.regions()[0]["town"]
    out = regions.build([town])
    assert out["incomplete"] == [town]
    entry = regions.get(town)
    assert entry["rainfall"] is None
    assert entry["missing"][0]["field"] == "rainfall"
    assert "CHIRPS down" in entry["missing"][0]["reason"]


def test_assessment_reads_the_full_baseline_for_spi(monkeypatch: pytest.MonkeyPatch) -> None:
    asked: list[str] = []

    def fake(
        _client: Any, _url: str, stamp: str, *_: Any
    ) -> tuple[float | None, str | None, str | None]:
        asked.append(stamp)
        return 100.0 + int(stamp[:4]) % 7 * 10 + int(stamp[5:]), "sha256:x", None

    monkeypatch.setattr(chirps, "latest_month", lambda _c: (2026, 8))
    monkeypatch.setattr(chirps, "parse_cell", lambda *_: {"row": 1, "col": 1})
    monkeypatch.setattr(chirps, "_cached_value", fake)
    out = chirps.assessment(16.7, 95.6, client=mock(lambda r: httpx.Response(200)))
    for year in range(1991, 2021):
        assert {f"{year}-08", f"{year}-07", f"{year}-06"} <= set(asked)
    assert len(out["series"]) == 12 and out["series"][-1]["period"] == "2026-08"
    assert out["statistics"]["spi3"] is not None
    assert out["statistics"]["latest_percentile"] is not None


def test_shared_keys_file_loads_from_any_working_directory(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.chdir(tmp_path)
    loaded = Settings()
    assert Path(KEYS_FILE).is_file()
    assert loaded.gfw_api_key is not None
    assert loaded.global_fishing_watch_token is not None


def gfw_transport(
    loss: list[dict[str, Any]], fires: list[dict[str, Any]], latest: str | None
) -> tuple[httpx.Client, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.method == "GET":
            return httpx.Response(200, json={"data": {"version": "v9"}})
        sql = json.loads(request.content)["sql"]
        if "MAX(alert__date)" in sql:
            return httpx.Response(200, json={"data": [{"max": latest}] if latest else []})
        if "confidence__cat" in sql:
            return httpx.Response(200, json={"data": fires})
        if "clark_labs" in sql:
            return httpx.Response(
                200,
                json={"data": [{gfw_forest.PONDS: 5, "area__ha": 1.5}], "status": "success"},
            )
        return httpx.Response(200, json={"data": loss})

    return mock(handler), seen


def test_forest_screening_sums_loss_after_the_cutoff_and_hides_the_key() -> None:
    loss = [
        {"umd_tree_cover_loss__year": 2023, "area__ha": 2.0},
        {"umd_tree_cover_loss__year": 2022, "area__ha": 0.5},
    ]
    http, seen = gfw_transport(loss, [{"confidence__cat": "h", "count": 3}], "2999-01-01")
    out = gfw_forest.compliance(16.7, 95.6, 1.0, date(2026, 10, 13), http)
    assert [y["year"] for y in out["tree_cover_loss"]["years"]] == [2022, 2023]
    assert out["tree_cover_loss"]["total_ha"] == 2.5
    assert out["fire_alerts"]["total"] == 3
    assert out["aquaculture_ponds_2018"]["classes"] == [{"class": 5, "area_ha": 1.5}]
    assert "not a compliance certificate" in out["scope"]
    posted = [json.loads(r.content)["sql"] for r in seen if r.method == "POST"]
    assert any("> 2020" in sql and ">= 30" in sql for sql in posted)
    assert all(r.headers["x-api-key"] for r in seen)
    key = get_settings().gfw_api_key
    assert key is not None and key.get_secret_value() not in json.dumps(out)


def test_fire_alerts_are_unknown_when_the_dataset_ends_before_the_window() -> None:
    http, _ = gfw_transport([], [], "2026-05-01")
    out = gfw_forest.compliance(16.7, 95.6, 1.0, date(2026, 10, 13), http)
    assert out["fire_alerts"]["total"] is None
    assert out["fire_alerts"]["dataset_data_through"] == "2026-05-01"
    assert any(m["field"] == "alerts" for m in out["missing"])
    assert out["tree_cover_loss"]["years"] == []


def test_forest_outage_gives_null_with_a_reason_and_bad_radius_is_rejected() -> None:
    http = mock(lambda r: httpx.Response(504))
    out = gfw_forest.compliance(16.7, 95.6, 1.0, date(2026, 10, 13), http)
    assert out["tree_cover_loss"]["years"] is None and out["tree_cover_loss"]["total_ha"] is None
    assert out["fire_alerts"]["total"] is None
    assert out["missing"]
    with pytest.raises(ValueError):
        gfw_forest.compliance(16.7, 95.6, 30.0)


def test_gfw_dataset_search_matches_every_word() -> None:
    rows = [
        {"dataset": "umd_tree_cover_loss", "metadata": {"title": "Tree cover loss"}},
        {
            "dataset": "clark_pond",
            "metadata": {"title": "Tropical pond aquaculture"},
            "versions": None,
        },
    ]
    http = mock(lambda r: httpx.Response(200, json={"data": rows}))
    hit = gfw_forest.search_datasets("pond aquaculture", 5, http)
    assert [h["dataset"] for h in hit["hits"]] == ["clark_pond"]
    miss = gfw_forest.search_datasets("sheep", 5, http)
    assert miss["hits"] == [] and miss["missing"]


def test_fishing_watch_aggregates_effort_and_events_and_survives_nulls() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"].startswith("Bearer ")
        if request.url.path.endswith("/4wings/report"):
            cells = [
                {"flag": "VNM", "hours": 10.0, "lat": 9.1, "lon": 106.2, "vesselIDs": 2},
                {"flag": "VNM", "hours": 5.5, "lat": 9.2, "lon": 106.2, "vesselIDs": 1},
                {"flag": "", "hours": 1.0, "lat": 9.3, "lon": 106.2, "vesselIDs": 1},
            ]
            return httpx.Response(
                200, json={"entries": [{"public-global-fishing-effort:v4.0": cells}, {"x": None}]}
            )
        event = {
            "start": "2026-09-29T09:13:35.000Z",
            "vessel": {"flag": "VNM"},
            "regions": {"eez12Nm": ["x"]},
            "distances": {"startDistanceFromShoreKm": 12},
        }
        return httpx.Response(200, json={"total": 1, "nextOffset": None, "entries": [event]})

    out = gfw_marine.coastal_vessels(
        9.15, 106.2, 30, date(2026, 7, 1), date(2026, 9, 30), mock(handler)
    )
    assert out["fishing_effort"]["hours_by_flag"] == {"VNM": 15.5, "unknown": 1.0}
    assert out["fishing_events"]["within_12_nm"] == 1
    assert out["fishing_events"]["nearest_to_shore_km"] == 12
    assert out["missing"] == []
    assert "not proof" in out["scope"]


def test_fishing_watch_rejects_bad_windows_and_reports_outages() -> None:
    with pytest.raises(ValueError):
        gfw_marine.coastal_vessels(9.0, 106.0, 30, date(2025, 1, 1), date(2026, 6, 1))
    with pytest.raises(ValueError):
        gfw_marine.coastal_vessels(9.0, 106.0, 500)
    out = gfw_marine.coastal_vessels(
        9.15, 106.2, 30, date(2026, 7, 1), date(2026, 9, 30), mock(lambda r: httpx.Response(503))
    )
    assert out["fishing_effort"]["total_hours"] is None
    assert out["fishing_events"]["total"] is None
    assert len(out["missing"]) == 2


def test_gfw_tools_are_read_only_and_listed() -> None:
    names = set(select_tools(False))
    assert {"gfw_forest_compliance", "gfw_dataset_search", "gfw_coastal_vessels"} <= names
    assert "gfw_vessel_search" in names


def square(lat: float, lon: float, metres: float) -> list[dict[str, float]]:
    dy = metres / 110_574.0
    dx = metres / (111_320.0 * math.cos(math.radians(lat)))
    ring = [(0, 0), (dx, 0), (dx, dy), (0, dy), (0, 0)]
    return [{"lat": lat + y, "lon": lon + x} for x, y in ring]


def overpass_body(ways: list[tuple[int, list[dict[str, float]], dict[str, str]]]) -> bytes:
    elements = [
        {"type": "way", "id": way_id, "geometry": geometry, "tags": tags}
        for way_id, geometry, tags in ways
    ]
    return json.dumps({"elements": elements}).encode()


def test_polygon_area_and_centroid_match_a_hundred_metre_square() -> None:
    ring = square(16.7, 95.6, 100.0)
    stats = farm_sites.polygon_stats([(p["lat"], p["lon"]) for p in ring])
    assert stats is not None
    area_ha, lat, lon = stats
    assert area_ha == pytest.approx(1.0, rel=0.01)
    assert lat == pytest.approx(16.7 + 50 / 110_574.0, abs=1e-5)
    assert lon == pytest.approx(95.6 + 50 / (111_320.0 * math.cos(math.radians(16.7))), abs=1e-5)
    assert farm_sites.polygon_stats([(0.0, 0.0), (0.0, 1.0), (1.0, 1.0)]) is None


def test_candidates_drop_tiny_huge_and_non_way_elements_and_choose_keeps_distance() -> None:
    center = (16.7, 95.6)
    raw = overpass_body(
        [
            (1, square(16.70, 95.60, 100.0), {"landuse": "farmland", "crop": "rice"}),
            (2, square(16.7002, 95.6002, 100.0), {"landuse": "farmland"}),
            (3, square(16.71, 95.61, 100.0), {"landuse": "farmland"}),
            (4, square(16.72, 95.62, 5.0), {"landuse": "farmland"}),
            (5, square(16.73, 95.63, 5000.0), {"landuse": "farmland"}),
        ]
    )
    found = farm_sites.candidates(raw, center)
    assert {c["osm"] for c in found} == {"way/1", "way/2", "way/3"}
    picked = farm_sites.choose(found)
    assert [c["osm"] for c in picked] == ["way/1", "way/3"]


def test_site_discovery_widens_the_search_and_records_the_land_cover_check(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ways = [
        (n, square(16.70 + n * 0.01, 95.6, 100.0), {"landuse": "farmland"}) for n in range(1, 4)
    ]
    radii: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        radii.append(request.content.decode())
        return httpx.Response(200, content=overpass_body(ways))

    monkeypatch.setattr(farm_sites, "PAUSE_S", 0.0)
    monkeypatch.setattr(
        farm_sites,
        "land_cover",
        lambda site: {"class": "Agriculture", "agrees": True, "missing": []},
    )
    town = {"town": "Maubin, Ayeyarwady", "country": "Myanmar", "latitude": 16.7, "longitude": 95.6}
    out = farm_sites.build_town(mock(handler), town)
    assert [a["radius_m"] for a in out["search"]] == list(farm_sites.RADII_M)
    assert any("12000" in r for r in radii) and any("25000" in r for r in radii)
    assert len(out["sites"]) == 3 and all(s["land_cover_check"]["agrees"] for s in out["sites"])
    assert out["source"]["sha256"].startswith("sha256:") and out["licence"].startswith("ODbL")


def test_site_discovery_reports_towns_without_mapped_farmland(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(farm_sites, "PAUSE_S", 0.0)
    town = {"town": "Nowhere", "country": "Myanmar", "latitude": 1.0, "longitude": 1.0}
    out = farm_sites.build_town(
        mock(lambda r: httpx.Response(200, content=b'{"elements":[]}')), town
    )
    assert out["sites"] == [] and out["missing"] and out["source"] is None


def test_site_build_records_a_garbled_overpass_reply_and_keeps_going(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(farm_sites, "SITES", tmp_path / "sites.json")
    monkeypatch.setattr(farm_sites, "_fetch", lambda *a: b"<html>runtime error: timeout</html>")
    out = farm_sites.build(["Maubin, Ayeyarwady", "Pyapon, Ayeyarwady"])
    assert out["without_sites"] == ["Maubin, Ayeyarwady", "Pyapon, Ayeyarwady"]
    entry = farm_sites.read()["towns"]["Maubin, Ayeyarwady"]
    assert entry["sites"] == [] and "JSONDecodeError" in entry["missing"][0]["reason"]


def make_gleam(
    path: Path, variable: str, days: int, cell: tuple[int, int], values: list[float]
) -> None:
    with h5py.File(path, "w") as h5:
        data = h5.create_dataset(
            variable,
            shape=(days, gleam.ROWS, gleam.COLS),
            dtype="float32",
            chunks=(min(days, 12), 100, 100),
            fillvalue=gleam.FILL,
            compression="gzip",
        )
        data[:, cell[0], cell[1]] = np.asarray(values, dtype="float32")


def gleam_files(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, files: dict[str, Path]
) -> list[str]:
    opened: list[str] = []

    from contextlib import contextmanager

    @contextmanager
    def fake_open(path: str) -> Iterator[gleam.Handle]:
        opened.append(path)
        local = files.get(path.split("/")[-1].split("_")[0])
        if local is None:
            raise OSError("no such file")
        with h5py.File(local, "r") as h5:
            yield gleam.Handle(h5, path, local.stat().st_size)

    monkeypatch.setattr(gleam, "open_file", fake_open)
    monkeypatch.setattr(gleam, "latest_year", lambda: 2025)
    return opened


def test_gleam_grid_cell_matches_the_published_first_cell_and_rejects_outside() -> None:
    assert gleam.cell_of(89.95, -179.95) == (0, 0)
    assert gleam.cell_of(-89.95, 179.95) == (1799, 3599)
    assert gleam.centre_of(732, 2756) == {"latitude": 16.75, "longitude": 95.65}
    with pytest.raises(ValueError):
        gleam.cell_of(95.0, 0.0)


def test_gleam_monthly_reads_the_cell_totals_and_keeps_fill_values_null(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    row, col = gleam.cell_of(16.731, 95.654)
    e = [50.0] * 11 + [-999.0]
    files = {}
    for name, values in (
        ("E", e),
        ("Ep", [100.0] * 12),
        ("Et", [10.0] * 12),
        ("Eb", [5.0] * 12),
        ("S", [0.5] * 12),
        ("SMrz", [0.4] * 12),
    ):
        files[name] = tmp_path / f"{name}.nc"
        make_gleam(files[name], name, 12, (row, col), values)
    opened = gleam_files(monkeypatch, tmp_path, files)
    out = gleam.stress(16.731, 95.654)
    assert out["variant"] == "v4.3b" and out["year"] == 2025
    assert out["cell"]["centre"] == {"latitude": 16.75, "longitude": 95.65}
    assert out["variables"]["E"]["values"][-1] is None
    assert out["variables"]["Et"]["values"][0] == 10.0
    assert out["annual"]["E_mm"] is None and out["annual"]["Ep_mm"] == 1200.0
    assert out["annual"]["Et_mm"] == 120.0 and out["annual"]["S_mean"] == 0.5
    assert out["source"]["sha256"].startswith("sha256:")
    assert "monthly totals" in out["note"]
    assert any("monthly/Et/Et_2025_GLEAM_v4.3b_MO.nc" in p for p in opened)
    before = len(opened)
    again = gleam.stress(16.731, 95.654)
    assert len(opened) == before and again["variables"] == out["variables"]


def test_gleam_uses_version_a_before_2003_and_rejects_future_years(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    row, col = gleam.cell_of(16.731, 95.654)
    files = {}
    for name in gleam.STRESS_VARIABLES:
        files[name] = tmp_path / f"{name}.nc"
        make_gleam(files[name], name, 12, (row, col), [1.0] * 12)
    opened = gleam_files(monkeypatch, tmp_path, files)
    out = gleam.monthly(16.731, 95.654, 1999)
    assert out["variant"] == "v4.3a" and all("/v4.3a/" in p for p in opened)
    with pytest.raises(ValueError):
        gleam.monthly(16.731, 95.654, 2031)
    with pytest.raises(ValueError):
        gleam.monthly(16.731, 95.654, 2024, ("Zz",))


def test_gleam_daily_slices_the_requested_days(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    row, col = gleam.cell_of(16.731, 95.654)
    values = [float(i) for i in range(365)]
    path = tmp_path / "Et.nc"
    make_gleam(path, "Et", 365, (row, col), values)
    gleam_files(monkeypatch, tmp_path, {"Et": path})
    out = gleam.daily(16.731, 95.654, date(2025, 1, 30), date(2025, 2, 2), ("Et",))
    assert out["dates"][0] == "2025-01-30" and out["dates"][-1] == "2025-02-02"
    assert out["variables"]["Et"]["values"] == [29.0, 30.0, 31.0, 32.0]
    with pytest.raises(ValueError):
        gleam.daily(16.731, 95.654, date(2025, 12, 30), date(2026, 1, 2))
    with pytest.raises(ValueError):
        gleam.daily(16.731, 95.654, date(2025, 1, 1), date(2025, 6, 1))


def test_gleam_outage_gives_null_with_reasons_and_the_breaker_stops_hammering(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls: list[str] = []

    from contextlib import contextmanager

    @contextmanager
    def broken(path: str) -> Iterator[gleam.Handle]:
        calls.append(path)
        raise OSError("connection reset")
        yield  # pragma: no cover

    monkeypatch.setattr(gleam, "open_file", broken)
    monkeypatch.setattr(gleam, "latest_year", lambda: 2025)
    out = gleam.stress(16.731, 95.654)
    assert all(v["values"] is None for v in out["variables"].values())
    assert out["source"] is None and len(out["missing"]) == len(gleam.STRESS_VARIABLES)
    assert len(calls) <= 3 * 3 + 3


def test_gleam_credentials_are_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "gleam_user", None)
    with pytest.raises(gleam.GleamError), gleam._sftp():
        pass


def test_retry_only_repeats_transient_failures_and_the_breaker_opens_then_recovers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    attempts: list[int] = []

    def flaky() -> str:
        attempts.append(1)
        if len(attempts) < 3:
            raise httpx.ConnectError("reset")
        return "ok"

    assert retry(flaky, attempts=3) == "ok" and len(attempts) == 3
    bad: list[int] = []

    def forbidden() -> None:
        bad.append(1)
        raise httpx.HTTPStatusError(
            "no", request=httpx.Request("GET", "http://x"), response=httpx.Response(401)
        )

    with pytest.raises(httpx.HTTPStatusError):
        retry(forbidden, attempts=3)
    assert len(bad) == 1
    breaker = Breaker(threshold=2, cooldown_s=0.05)
    for _ in range(2):
        with pytest.raises(httpx.ConnectError):
            breaker.call(lambda: (_ for _ in ()).throw(httpx.ConnectError("x")))
    with pytest.raises(CircuitOpen):
        breaker.call(lambda: "never")
    import time

    time.sleep(0.06)
    assert breaker.call(lambda: "back") == "back"


def test_gleam_never_holds_more_connections_than_the_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    import threading
    import time
    from concurrent.futures import ThreadPoolExecutor

    live = 0
    peak = 0
    lock = threading.Lock()

    class FakeTransport:
        banner_timeout = 0

        def __init__(self, *_: object) -> None:
            nonlocal live, peak
            with lock:
                live += 1
                peak = max(peak, live)

        def connect(self, **_: object) -> None:
            time.sleep(0.02)

        def close(self) -> None:
            nonlocal live
            with lock:
                live -= 1

    class FakeChannel:
        def settimeout(self, _: float) -> None:
            return None

    class FakeClient:
        def get_channel(self) -> FakeChannel:
            return FakeChannel()

        def close(self) -> None:
            return None

    monkeypatch.setattr(gleam.paramiko, "Transport", FakeTransport)
    monkeypatch.setattr(gleam.paramiko.SFTPClient, "from_transport", lambda _: FakeClient())

    def one(_: int) -> None:
        with gleam._sftp():
            time.sleep(0.02)

    with ThreadPoolExecutor(max_workers=9) as pool:
        list(pool.map(one, range(18)))
    assert 1 <= peak <= gleam.MAX_CONNECTIONS
    assert live == 0


def test_data_health_shows_an_open_circuit_then_recovers() -> None:
    client = TestClient(create_app())
    url = "/api/v1/agriquill/data/health"
    assert client.get(url).json()["gleam"] == {"state": "closed", "failures": 0, "retry_in_s": 0.0}
    for _ in range(gleam._BREAKER.threshold):
        with pytest.raises(ConnectionError):
            gleam._BREAKER.call(lambda: (_ for _ in ()).throw(ConnectionError("down")))
    shown = client.get(url).json()["gleam"]
    assert shown["state"] == "open" and shown["retry_in_s"] > 0
    gleam._BREAKER.reset()
    assert client.get(url).json()["gleam"]["state"] == "closed"
