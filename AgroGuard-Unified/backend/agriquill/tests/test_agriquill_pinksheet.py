import io
import zipfile
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest

from agriquill import store
from agriquill.config import get_settings
from agriquill.data import pinksheet

STRINGS = [
    "World Bank Commodity Price Data (The Pink Sheet)",
    "Updated on October 02, 2026",
    "Coffee, Robusta",
    "Rice, Thai 5% ",
    "($/kg)",
    "($/mt)",
    "2026M08",
    "2026M09",
]


def xlsx() -> bytes:
    def s(i: int) -> str:
        return f'<c r="{{}}" t="s"><v>{i}</v></c>'

    rows = [
        ("1", [("A", s(0))]),
        ("2", [("A", s(1))]),
        ("5", [("B", s(2)), ("C", s(3))]),
        ("6", [("B", s(4)), ("C", s(5))]),
        ("7", [("A", s(6)), ("B", '<c r="{}"><v>3.5</v></c>'), ("C", '<c r="{}"><v>470</v></c>')]),
        ("8", [("A", s(7)), ("B", '<c r="{}"><v>3.69</v></c>')]),
    ]
    body = "".join(
        f'<row r="{n}">' + "".join(cell.format(f"{col}{n}") for col, cell in cells) + "</row>"
        for n, cells in rows
    )
    ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    rel = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(
            "xl/sharedStrings.xml",
            f"<sst {ns}>" + "".join(f"<si><t>{t}</t></si>" for t in STRINGS) + "</sst>",
        )
        z.writestr(
            "xl/workbook.xml",
            f'<workbook {ns} {rel}><sheets><sheet name="Monthly Prices" sheetId="1" r:id="rId9"/>'
            "</sheets></workbook>",
        )
        z.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId9" Target="worksheets/sheet7.xml"/></Relationships>',
        )
        z.writestr(
            "xl/worksheets/sheet7.xml", f"<worksheet {ns}><sheetData>{body}</sheetData></worksheet>"
        )
    return buf.getvalue()


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


def test_parse_takes_latest_value_per_series_with_units():
    out = pinksheet.parse(xlsx())
    assert out["updated"] == "Updated on October 02, 2026"
    assert out["series"]["Coffee, Robusta"] == {
        "series": "Coffee, Robusta",
        "month": "2026-09",
        "value": 3.69,
        "unit": "$/kg",
    }
    assert out["series"]["Rice, Thai 5%"]["month"] == "2026-08"


def test_benchmarks_convert_to_usd_per_tonne_and_cite_source():
    client = httpx.Client(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, content=xlsx()))
    )
    out = pinksheet.benchmarks(client)
    assert out["crops"]["coffee"]["usd_per_tonne"] == 3690.0
    assert out["crops"]["rice"]["usd_per_tonne"] == 470.0
    assert out["source"]["sha256"].startswith("sha256:")
    assert any(m["field"] == "maize" for m in out["missing"])


def test_outage_without_cache_is_null_with_reason():
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(503)))
    out = pinksheet.benchmarks(client)
    assert out["crops"] == {} and out["source"] is None
    assert "unavailable" in out["missing"][0]["reason"]
