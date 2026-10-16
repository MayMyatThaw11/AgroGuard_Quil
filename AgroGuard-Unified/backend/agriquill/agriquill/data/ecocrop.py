from __future__ import annotations

import argparse
import json
import re
import string
import time
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

import httpx

BASE_URL = "https://ecocrop.apps.fao.org/ecocrop/srv/en"
SOURCE = "FAO EcoCrop (ecocrop.apps.fao.org)"
DATA_PATH = Path(__file__).with_name("ecocrop.json")
REQUEST_GAP_S = 1.0

ASEAN_CROPS = (
    "Oryza sativa",
    "Zea mays",
    "Manihot esculenta",
    "Saccharum officinarum",
    "Elaeis guineensis",
    "Coffea canephora",
    "Coffea arabica",
    "Camellia sinensis",
    "Theobroma cacao",
    "Hevea brasiliensis",
    "Cocos nucifera",
    "Durio zibethinus",
    "Mangifera indica",
    "Musa acuminata",
    "Hylocereus undatus",
    "Capsicum annuum",
    "Allium cepa",
    "Ipomoea aquatica",
    "Ipomoea batatas",
    "Arachis hypogaea",
    "Glycine max",
    "Vigna radiata",
    "Sesamum indicum",
    "Colocasia esculenta",
    "Ananas comosus",
)

RANGES = {
    "Temperat. requir.": ("temperature_c", "°C"),
    "Rainfall (annual)": ("rainfall_mm", "mm/year"),
    "Latitude": ("latitude_deg", "°"),
    "Altitude": ("altitude_m", "m"),
    "Soil PH": ("soil_ph", "pH"),
    "Light intensity": ("light_intensity", None),
}
PAIRS = {
    "Soil depth": "soil_depth",
    "Soil texture": "soil_texture",
    "Soil fertility": "soil_fertility",
    "Soil Al. tox": "soil_al_toxicity",
    "Soil salinity": "soil_salinity",
    "Soil drainage": "soil_drainage",
}
SINGLES = {
    "Life form": "life_form",
    "Physiology": "physiology",
    "Habit": "habit",
    "Category": "category",
    "Life span": "life_span",
    "Plant attributes": "plant_attributes",
    "Climate zone": "climate_zone",
    "Photoperiod": "photoperiod",
    "Killing temp. during rest": "killing_temp_rest_c",
    "Killing temp. early growth": "killing_temp_early_c",
    "Abiotic toler.": "abiotic_tolerance",
    "Abiotic suscept.": "abiotic_susceptibility",
}
EMPTY = {"", "-", "---", "no input"}


class _Rows(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[str]] = []
        self.links: list[tuple[str, str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []
        elif tag == "a":
            self._href = dict(attrs).get("href") or ""
            self._text = []

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th") and self._row is not None and self._cell is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if any(self._row):
                self.rows.append(self._row)
            self._row = None
        elif tag == "a" and self._href is not None:
            self.links.append((self._href, " ".join("".join(self._text).split())))
            self._href = None

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)
        if self._href is not None:
            self._text.append(data)


def _value(text: str) -> str | None:
    return None if text.strip() in EMPTY else text.strip()


def _number(text: str) -> float | None:
    value = _value(text)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_list(html: str) -> dict[str, int]:
    parser = _Rows()
    parser.feed(html)
    found: dict[str, int] = {}
    for href, name in parser.links:
        match = re.search(r"cropView\?id=(\d+)", href)
        if match and name:
            found[name] = int(match.group(1))
    return found


def parse_datasheet(html: str, code: int, name: str) -> dict[str, Any]:
    parser = _Rows()
    parser.feed(html)
    record: dict[str, Any] = {"code": code, "name": name}
    for row in parser.rows:
        for i, cell in enumerate(row):
            after = row[i + 1 :]
            if cell in RANGES and len(after) >= 4:
                key, unit = RANGES[cell]
                read = _number if unit else _value
                record[key] = {
                    "optimal": [read(after[0]), read(after[1])],
                    "absolute": [read(after[2]), read(after[3])],
                    "unit": unit,
                }
            elif cell in PAIRS and len(after) >= 2:
                record[PAIRS[cell]] = {"optimal": _value(after[0]), "absolute": _value(after[1])}
            elif cell == "Crop cycle" and len(after) >= 2:
                record["crop_cycle_days"] = [_number(after[0]), _number(after[1])]
            elif cell in SINGLES and after:
                record[SINGLES[cell]] = _value(after[0])
    record["source"] = {
        "provider": SOURCE,
        "url": f"{BASE_URL}/dataSheet?id={code}",
        "source_class": "LITERATURE",
    }
    return record


def _get(client: httpx.Client, url: str) -> str:
    response = client.get(url, timeout=40)
    response.raise_for_status()
    time.sleep(REQUEST_GAP_S)
    return response.text


def sync(names: list[str] | None, out: Path = DATA_PATH) -> dict[str, Any]:
    with httpx.Client(
        follow_redirects=True, headers={"User-Agent": "AgriQill/0.1 ecocrop-sync"}
    ) as client:
        index: dict[str, int] = {}
        letters = sorted({n[0].lower() for n in names}) if names else list(string.ascii_lowercase)
        for letter in letters:
            index.update(
                parse_list(_get(client, f"{BASE_URL}/cropList?name={letter}&relation=beginsWith"))
            )
        wanted = names if names else sorted(index)
        crops: list[dict[str, Any]] = []
        missing: list[str] = []
        for name in wanted:
            code = index.get(name)
            if code is None:
                missing.append(name)
                continue
            crops.append(
                parse_datasheet(_get(client, f"{BASE_URL}/dataSheet?id={code}"), code, name)
            )
    payload = {
        "source": SOURCE,
        "url": f"{BASE_URL}/home",
        "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "licence": "TO VERIFY: FAO terms of use for EcoCrop reuse",
        "not_found": missing,
        "crops": crops,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return payload


_STORE: dict[Path, dict[str, Any]] = {}


def load(path: Path = DATA_PATH) -> dict[str, Any]:
    if path not in _STORE:
        _STORE[path] = (
            json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"crops": []}
        )
    return _STORE[path]


def search(query: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    crops = load()["crops"]
    if query:
        q = query.lower()
        crops = [c for c in crops if q in c["name"].lower() or q == str(c["code"])]
    return crops[:limit]


def get(code_or_name: str) -> dict[str, Any] | None:
    key = code_or_name.strip().lower()
    for crop in load()["crops"]:
        if str(crop["code"]) == key or crop["name"].lower() == key:
            return crop
    return None


SCREENED = (
    ("temperature_c", "mean_temp_c"),
    ("rainfall_mm", "annual_rain_mm"),
    ("altitude_m", "elevation_m"),
    ("soil_ph", "soil_ph"),
)


def _band(value: float, optimal: list[float | None], absolute: list[float | None]) -> str:
    lo, hi = absolute
    if (lo is not None and value < lo) or (hi is not None and value > hi):
        return "outside_absolute"
    olo, ohi = optimal
    if olo is None and ohi is None:
        return "within_absolute"
    if (olo is None or value >= olo) and (ohi is None or value <= ohi):
        return "within_optimal"
    return "within_absolute"


def screen(crop: dict[str, Any], site: dict[str, float | None]) -> dict[str, Any]:
    factors: list[dict[str, Any]] = []
    for key, site_key in SCREENED:
        limits = crop.get(key)
        value = site.get(site_key)
        if not limits:
            factors.append({"factor": key, "status": "unknown", "reason": "EcoCrop has no value"})
            continue
        if value is None:
            factors.append(
                {
                    "factor": key,
                    "status": "unknown",
                    "reason": f"site {site_key} not given",
                    "ecocrop": limits,
                }
            )
            continue
        factors.append(
            {
                "factor": key,
                "status": _band(value, limits["optimal"], limits["absolute"]),
                "site": value,
                "ecocrop": limits,
            }
        )
    statuses = {f["status"] for f in factors}
    if "outside_absolute" in statuses:
        verdict = "contraindicated"
    elif statuses == {"within_optimal"}:
        verdict = "suitable"
    elif statuses <= {"within_optimal", "within_absolute"}:
        verdict = "conditional"
    else:
        verdict = "unknown" if statuses == {"unknown"} else "conditional"
    return {
        "crop": {"code": crop["code"], "name": crop["name"]},
        "verdict": verdict,
        "factors": factors,
        "source": crop["source"],
        "note": "Range screen against EcoCrop optimal and absolute limits. "
        "Not a yield or profit estimate.",
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Fetch FAO EcoCrop data sheets into local JSON.")
    parser.add_argument(
        "--all", action="store_true", help="fetch every crop (slow: about 1 request/s)"
    )
    parser.add_argument("--names", help="comma-separated scientific names (default: ASEAN set)")
    parser.add_argument("--out", type=Path, default=DATA_PATH)
    args = parser.parse_args(argv)
    names = (
        None
        if args.all
        else ([n.strip() for n in args.names.split(",")] if args.names else list(ASEAN_CROPS))
    )
    payload = sync(names, args.out)
    print(f"{len(payload['crops'])} crops written to {args.out}; not found: {payload['not_found']}")


if __name__ == "__main__":
    main()
