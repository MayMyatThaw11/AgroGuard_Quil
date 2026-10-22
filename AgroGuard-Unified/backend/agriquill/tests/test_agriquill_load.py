import asyncio
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "load_farm_map.py"


def _harness():
    spec = importlib.util.spec_from_file_location("load_farm_map", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_twenty_synthetic_farms_under_load_keep_every_write_and_the_ledger():
    report = asyncio.run(_harness().run_in_process(farms=20, plots=50, concurrency=10))
    checks = report["checks"]
    assert checks["server_errors"] == 0, report["failures"]
    assert checks["no_lost_write"], checks
    assert checks["ledger_intact"]
    assert report["errors_by_status"] == {}, report["failures"]
    assert report["outside_calls"]["by_host"].keys() <= {"api.open-meteo.com"}
