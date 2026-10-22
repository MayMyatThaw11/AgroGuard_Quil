from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass, field
from typing import Any

from . import conversion, geometry, safety
from .config import get_settings

TOKEN = re.compile(
    r"(?P<ws>\s+)|(?P<comment>(//|#)[^\n]*)|(?P<str>\"[^\"\n]*\")|(?P<range>\.\.)"
    r"|(?P<num>-?\d+(?:\.\d+)?)|(?P<ident>[A-Za-z_%][A-Za-z0-9_\-/]*)|(?P<punct>[{}\[\]():,])"
)
UNITS: dict[str, tuple[str, float]] = {
    "cm": ("length", 1.0),
    "mm": ("length", 0.1),
    "m": ("length", 100.0),
    "m/s": ("speed", 1.0),
    "km/h": ("speed", 1 / 3.6),
    "C": ("temperature", 1.0),
    "ha": ("area", 1.0),
    "kg/ha": ("rate", 1.0),
    "kg_N/ha": ("rate", 1.0),
    "x": ("ratio", 1.0),
    "h": ("time", 1.0),
    "min": ("time", 1 / 60),
    "mm/day": ("flux", 1.0),
    "%": ("percent", 1.0),
    "mg/L": ("concentration", 1.0),
    "kPa": ("pressure", 1.0),
}
CONTRACT_BLOCKS = ("hydrology", "actuation_gates", "yield_logic", "schedule", "sensors")
HERD_KINDS = {"fish", "shrimp", "ducks", "poultry", "buffalo", "cattle", "goats"}
WATER_ANIMALS = {"fish", "shrimp"}
SPEC: dict[str, dict[str, tuple[str, bool]]] = {
    "hydrology": {
        "trigger_irrig_below": ("cm", False),
        "flowering_lock_depth": ("cm", True),
        "reflood_depth": ("cm", False),
        "percolation": ("mm/day", False),
    },
    "actuation_gates": {
        "max_wind_speed": ("m/s", False),
        "valid_delta_t": ("C", True),
        "max_rain_6h_post": ("mm", False),
    },
    "yield_logic": {
        "max_canopy_nitrogen": ("kg/ha", False),
        "min_marginal_roi": ("x", False),
    },
}
TO_VERIFY = {
    "valid_delta_t": "Delta-T 2-8 C band is spray-application guidance, not a local rule",
    "max_rain_6h_post": "rain-fastness depends on the product label",
    "trigger_irrig_below": "AWD -15 cm safe threshold is IRRI guidance, not locally calibrated",
    "percolation": "percolation rate must be measured per field",
}


@dataclass
class Token:
    kind: str
    text: str
    line: int
    col: int
    start: int
    end: int


@dataclass
class Field:
    value: Any
    unit: str | None
    hi: float | None
    hi_unit: str | None
    line: int
    col: int
    start: int
    end: int


@dataclass
class Block:
    type: str
    name: str | None
    line: int
    fields: dict[str, Field] = field(default_factory=dict)
    blocks: list[Block] = field(default_factory=list)

    def child(self, kind: str) -> Block | None:
        return next((b for b in self.blocks if b.type == kind), None)


class ParseError(ValueError):
    def __init__(self, message: str, token: Token | None) -> None:
        super().__init__(message)
        self.line = token.line if token else 1
        self.col = token.col if token else 1


def tokenize(text: str) -> list[Token]:
    tokens: list[Token] = []
    pos, line, line_start = 0, 1, 0
    while pos < len(text):
        m = TOKEN.match(text, pos)
        if m is None:
            bad = Token("bad", text[pos], line, pos - line_start + 1, pos, pos + 1)
            raise ParseError(f"unexpected character {text[pos]!r}", bad)
        kind = m.lastgroup or ""
        if kind not in ("ws", "comment"):
            value = m.group()
            tokens.append(Token(kind, value, line, pos - line_start + 1, pos, m.end()))
        for nl in re.finditer("\n", m.group()):
            line += 1
            line_start = pos + nl.end()
        pos = m.end()
    return tokens


class _Parser:
    def __init__(self, tokens: list[Token]) -> None:
        self.t = tokens
        self.i = 0

    def peek(self, ahead: int = 0) -> Token | None:
        j = self.i + ahead
        return self.t[j] if j < len(self.t) else None

    def take(self, text: str | None = None) -> Token:
        tok = self.peek()
        if tok is None or (text is not None and tok.text != text):
            want = f"{text!r}" if text else "a token"
            raise ParseError(f"expected {want}, found {tok.text if tok else 'end of file'}", tok)
        self.i += 1
        return tok

    def body(self, block: Block, closing: bool) -> None:
        while True:
            tok = self.peek()
            if tok is None:
                if closing:
                    raise ParseError(f"block {block.type} is not closed", self.t[-1])
                return
            if tok.text == "}" and closing:
                self.i += 1
                return
            if tok.kind != "ident":
                raise ParseError(f"expected a key or block, found {tok.text}", tok)
            key = self.take()
            nxt = self.peek()
            if nxt is not None and nxt.text == ":":
                self.i += 1
                block.fields[key.text] = self.value()
            elif nxt is not None and nxt.text == "{":
                self.i += 1
                child = Block(key.text, None, key.line)
                self.body(child, True)
                block.blocks.append(child)
            elif nxt is not None and nxt.kind in ("ident", "str", "num"):
                name = self.take()
                self.take("{")
                child = Block(key.text, name.text.strip('"'), key.line)
                self.body(child, True)
                block.blocks.append(child)
            else:
                raise ParseError(f"expected ':' or '{{' after {key.text}", nxt or key)

    def unit(self) -> str | None:
        tok, after = self.peek(), self.peek(1)
        if tok is None or tok.kind != "ident":
            return None
        if after is not None and after.text in (":", "{", "("):
            return None
        self.i += 1
        return tok.text

    def value(self) -> Field:
        tok = self.take()
        if tok.kind == "str":
            return Field(tok.text[1:-1], None, None, None, tok.line, tok.col, tok.start, tok.end)
        if tok.kind == "num":
            unit = self.unit()
            out = Field(float(tok.text), unit, None, None, tok.line, tok.col, tok.start, tok.end)
            nxt = self.peek()
            if nxt is not None and nxt.kind == "range":
                self.i += 1
                hi = self.take()
                if hi.kind != "num":
                    raise ParseError("a range needs a number after '..'", hi)
                out.hi, out.hi_unit = float(hi.text), self.unit()
            out.end = self.t[self.i - 1].end
            return out
        if tok.text == "[":
            items: list[Any] = []
            while (nxt := self.peek()) is not None and nxt.text != "]":
                items.append(self.value().value)
                if (sep := self.peek()) is not None and sep.text == ",":
                    self.i += 1
            end = self.take("]")
            return Field(items, None, None, None, tok.line, tok.col, tok.start, end.end)
        if tok.kind == "ident":
            nxt = self.peek()
            if nxt is not None and nxt.text == "(":
                self.i += 1
                args: dict[str, Any] = {}
                while (arg := self.peek()) is not None and arg.text != ")":
                    if arg.kind == "ident" and (c := self.peek(1)) is not None and c.text == ":":
                        self.i += 2
                        args[arg.text] = self.value().value
                    else:
                        args[str(len(args))] = self.value().value
                    if (sep := self.peek()) is not None and sep.text == ",":
                        self.i += 1
                end = self.take(")")
                call = {"call": tok.text, "args": args}
                return Field(call, None, None, None, tok.line, tok.col, tok.start, end.end)
            if nxt is not None and nxt.text == "{":
                self.i += 1
                typed = Block(tok.text, None, tok.line)
                self.body(typed, True)
                end_tok = self.t[self.i - 1]
                return Field(typed, None, None, None, tok.line, tok.col, tok.start, end_tok.end)
            return Field(tok.text, None, None, None, tok.line, tok.col, tok.start, tok.end)
        raise ParseError(f"unexpected {tok.text}", tok)


def parse(text: str) -> Block:
    root = Block("document", None, 1)
    _Parser(tokenize(text)).body(root, False)
    return root


def _diag(code: str, severity: str, line: int, col: int, msg: str, fix: str) -> dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "line": line,
        "column": col,
        "message": msg,
        "recommendation": fix,
    }


def _convert(f: Field, target: str, diags: list[dict[str, Any]], key: str) -> Any:
    def one(value: float, unit: str | None) -> float | None:
        if unit is None:
            unit = target
        if unit not in UNITS or UNITS[unit][0] != UNITS[target][0]:
            diags.append(
                _diag(
                    "AGRI-E022",
                    "ERROR",
                    f.line,
                    f.col,
                    f"{key}: unit {unit!r} is not a {UNITS[target][0]} unit.",
                    f"Write the value in {target}.",
                )
            )
            return None
        return round(value * UNITS[unit][1] / UNITS[target][1], 4)

    if not isinstance(f.value, float):
        diags.append(_diag("AGRI-E022", "ERROR", f.line, f.col, f"{key} must be a number.", target))
        return None
    lo = one(f.value, f.unit)
    if f.hi is None:
        return lo
    hi = one(f.hi, f.hi_unit or f.unit)
    if lo is not None and hi is not None and lo >= hi:
        diags.append(
            _diag(
                "AGRI-E021",
                "ERROR",
                f.line,
                f.col,
                f"{key}: range {lo} .. {hi} is empty.",
                "Write the lower bound first.",
            )
        )
    return [lo, hi]


def _section(block: Block, kind: str, diags: list[dict[str, Any]]) -> dict[str, Any]:
    section = block.child(kind)
    if section is None:
        return {}
    out: dict[str, Any] = {}
    for key, f in section.fields.items():
        if kind == "schedule":
            if key == "crew":
                out["crew"] = int(f.value) if isinstance(f.value, float) else None
            elif key == "travel_kmh":
                out["travel_kmh"] = float(f.value) if isinstance(f.value, float) else None
            else:
                out.setdefault("durations_h", {})[key] = _convert(f, "h", diags, key)
            continue
        if kind == "sensors":
            out[key] = str(f.value)
            continue
        if key == "regime":
            out["regime"] = str(f.value)
            continue
        spec = SPEC[kind].get(key)
        if spec is None:
            diags.append(
                _diag(
                    "AGRI-W022",
                    "WARNING",
                    f.line,
                    f.col,
                    f"Unknown key {key} in {kind}.",
                    f"Known keys: {', '.join(SPEC[kind])}.",
                )
            )
            continue
        unit, is_range = spec
        if is_range and f.hi is None:
            diags.append(
                _diag("AGRI-E021", "ERROR", f.line, f.col, f"{key} needs a range a .. b.", unit)
            )
            continue
        out[key] = _convert(f, unit, diags, key)
        if key in TO_VERIFY:
            diags.append(
                _diag(
                    "AGRI-W020",
                    "WARNING",
                    f.line,
                    f.col,
                    f"{key} is TO VERIFY: {TO_VERIFY[key]}.",
                    "Record the local source in docs/agriquill/OPEN_QUESTIONS.md.",
                )
            )
    return out


NORMALIZED = {
    "trigger_irrig_below": "trigger_cm",
    "flowering_lock_depth": "flowering_lock_cm",
    "reflood_depth": "reflood_cm",
    "percolation": "percolation_mm_day",
    "max_wind_speed": "max_wind_ms",
    "valid_delta_t": "delta_t_c",
    "max_rain_6h_post": "max_rain_6h_mm",
    "max_canopy_nitrogen": "max_canopy_n_kg_ha",
    "min_marginal_roi": "min_roi",
}


def _terms(block: Block, diags: list[dict[str, Any]]) -> dict[str, Any]:
    terms: dict[str, Any] = {}
    for kind, name in (
        ("hydrology", "hydrology"),
        ("actuation_gates", "gates"),
        ("yield_logic", "yield"),
        ("schedule", "schedule"),
        ("sensors", "sensors"),
    ):
        raw = _section(block, kind, diags)
        if raw:
            terms[name] = {NORMALIZED.get(k, k): v for k, v in raw.items()}
    return terms


def _scalar(block: Block, key: str) -> Any:
    f = block.fields.get(key)
    return None if f is None else f.value


def _walk(block: Block) -> list[Block]:
    out = [block]
    for child in block.blocks:
        out.extend(_walk(child))
    for f in block.fields.values():
        if isinstance(f.value, Block):
            out.extend(_walk(f.value))
    return out


def _fields(block: Block) -> list[tuple[str, Field]]:
    return [(k, f) for b in _walk(block) for k, f in b.fields.items()]


def _invariants(root: Block, contract: dict[str, Any], diags: list[dict[str, Any]]) -> None:
    ceiling = get_settings().wind_ceiling_ms
    scopes = [contract["farm"]["terms"], *[p["terms"] for p in contract["parcels"]]]
    for terms in scopes:
        wind = terms.get("gates", {}).get("max_wind_ms")
        if wind is not None and wind > ceiling:
            diags.append(
                _diag(
                    "AGRI-E020",
                    "ERROR",
                    1,
                    1,
                    f"max_wind_speed {wind} m/s relaxes the {ceiling} m/s hard ceiling.",
                    f"Set max_wind_speed to {ceiling} m/s or lower.",
                )
            )
        hydro = terms.get("hydrology", {})
        trigger = hydro.get("trigger_cm")
        lock = hydro.get("flowering_lock_cm")
        if (trigger is not None and trigger >= 0) or (
            lock and None not in lock and trigger is not None and lock[0] <= trigger
        ):
            diags.append(
                _diag(
                    "AGRI-E024",
                    "ERROR",
                    1,
                    1,
                    "AWD trigger must be below the soil surface and below the flowering lock.",
                    "Use trigger_irrig_below: -15 cm with flowering_lock_depth: 3 cm .. 5 cm.",
                )
            )
        if "min_roi" in terms.get("yield", {}):
            diags.append(
                _diag(
                    "AGRI-W021",
                    "WARNING",
                    1,
                    1,
                    "min_marginal_roi cannot be evaluated: no sourced yield-response curve.",
                    "Inputs are not blocked or passed on ROI until a curve is sourced.",
                )
            )
    cap = next(
        (
            t["yield"]["max_canopy_n_kg_ha"]
            for t in scopes
            if t.get("yield", {}).get("max_canopy_n_kg_ha")
        ),
        None,
    )
    for key, f in _fields(root):
        if isinstance(f.value, dict) and f.value.get("call") == "abort_on_wind":
            limit = f.value["args"].get("ceiling_ms")
            if isinstance(limit, float) and limit > ceiling:
                diags.append(
                    _diag(
                        "AGRI-E020",
                        "ERROR",
                        f.line,
                        f.col,
                        f"abort_on_wind ceiling {limit} m/s relaxes the {ceiling} m/s ceiling.",
                        f"Use ceiling_ms: {ceiling}.",
                    )
                )
        over_cap = cap is not None and isinstance(f.value, float) and f.value > cap
        if over_cap and "nitrogen" in key and key != "max_canopy_nitrogen":
            diags.append(
                _diag(
                    "AGRI-E023",
                    "ERROR",
                    f.line,
                    f.col,
                    f"{key} {f.value} kg/ha exceeds the {cap} kg/ha canopy nitrogen cap.",
                    "Lower the rate or split the application.",
                )
            )


def ring_area_ha(ring: list[list[float]]) -> float:
    lat0 = sum(p[0] for p in ring) / len(ring)
    kx = 111320.0 * math.cos(math.radians(lat0))
    xs = [(p[1] - ring[0][1]) * kx for p in ring]
    ys = [(p[0] - ring[0][0]) * 110574.0 for p in ring]
    twice = sum(xs[i] * ys[i + 1] - xs[i + 1] * ys[i] for i in range(len(ring) - 1))
    return round(abs(twice) / 2 / 10000.0, 3)


def parcel_positions(spec: dict[str, Any]) -> dict[str, tuple[float, float]]:
    """Where each field is, as the centre of its drawn boundary; fields without one are left out."""
    out: dict[str, tuple[float, float]] = {}
    for parcel in spec.get("parcels", []):
        ring = parcel.get("boundary")
        if ring:
            corners = ring[:-1]
            out[parcel["id"]] = (
                sum(p[0] for p in corners) / len(corners),
                sum(p[1] for p in corners) / len(corners),
            )
    return out


def _boundary(block: Block, diags: list[dict[str, Any]]) -> list[list[float]] | None:
    f = block.fields.get("boundary")
    if f is None:
        return None
    ring = f.value
    valid = (
        isinstance(ring, list)
        and len(ring) >= 4
        and all(
            isinstance(p, list)
            and len(p) == 2
            and all(isinstance(v, float) for v in p)
            and -90 <= p[0] <= 90
            and -180 <= p[1] <= 180
            for p in ring
        )
        and ring[0] == ring[-1]
    )
    if not valid:
        diags.append(
            _diag(
                "AGRI-E026",
                "ERROR",
                f.line,
                f.col,
                f"parcel {block.name}: boundary must be a closed ring of [lat, lon] pairs.",
                "Repeat the first point at the end and give at least three corners.",
            )
        )
        return None
    clean = [[float(p[0]), float(p[1])] for p in ring]
    problem = geometry.ring_problem(clean)
    if problem:
        diags.append(
            _diag(
                "AGRI-E033",
                "ERROR",
                f.line,
                f.col,
                f"parcel {block.name}: boundary is not a usable field, {problem}.",
                "Redraw the outline so its edges do not cross, or re-export it from the map.",
            )
        )
        return None
    return clean


def _herd(block: Block, contract: dict[str, Any], diags: list[dict[str, Any]]) -> dict[str, Any]:
    kind = str(_scalar(block, "kind") or "")
    paddy = _scalar(block, "paddy")
    count = block.fields.get("count")
    herd: dict[str, Any] = {
        "id": block.name,
        "kind": kind,
        "species": _scalar(block, "species"),
        "count": int(count.value) if count and isinstance(count.value, float) else None,
        "paddy": paddy,
        "sensors": {
            k: str(f.value)
            for k, f in (block.child("sensors") or Block("", None, 0)).fields.items()
        },
    }
    if kind not in HERD_KINDS:
        diags.append(
            _diag(
                "AGRI-W023",
                "WARNING",
                block.line,
                1,
                f"herd {block.name}: kind {kind!r} is not one of {', '.join(sorted(HERD_KINDS))}.",
                "Use a known kind so the planner can apply its rules.",
            )
        )
    if paddy is not None and paddy not in {p["id"] for p in contract["parcels"]}:
        diags.append(
            _diag(
                "AGRI-E025",
                "ERROR",
                block.line,
                1,
                f"herd {block.name} is placed in unknown paddy {paddy!r}.",
                "Use the id of a parcel in this contract.",
            )
        )
    for key, unit in (("min_water", "cm"), ("min_oxygen", "mg/L")):
        f = block.fields.get(key)
        if f is not None:
            herd[f"{key}_{'cm' if unit == 'cm' else 'mg_l'}"] = _convert(f, unit, diags, key)
            diags.append(
                _diag(
                    "AGRI-W020",
                    "WARNING",
                    f.line,
                    f.col,
                    f"{key} is TO VERIFY: set it from the species and the local extension service.",
                    "Record the local source in docs/agriquill/OPEN_QUESTIONS.md.",
                )
            )
    if kind in WATER_ANIMALS and paddy is not None and "min_water_cm" not in herd:
        diags.append(
            _diag(
                "AGRI-W024",
                "WARNING",
                block.line,
                1,
                f"{kind} in {paddy} with AWD drying: declare min_water or a refuge trench.",
                "Add min_water: 10 cm (TO VERIFY) so drying never strands the animals.",
            )
        )
    return herd


def _conversion(
    block: Block, standard: str | None, diags: list[dict[str, Any]]
) -> dict[str, Any] | None:
    claim = block.fields.get("sell_as")
    if claim is None or str(claim.value).lower() != "organic":
        return None
    out = conversion.check(
        standard,
        _scalar(block, "conversion_start"),
        _scalar(block, "planted"),
        _scalar(block, "harvest"),
    )
    if out["qualifies"] is False:
        diags.append(
            _diag(
                "AGRI-E034",
                "ERROR",
                claim.line,
                claim.col,
                f"parcel {block.name} cannot sell as organic: {out['reason']}.",
                f"Sell as conventional until {out['earliest'] or 'conversion start is recorded'}.",
            )
        )
    elif out["qualifies"] is None:
        diags.append(
            _diag(
                "AGRI-W034",
                "WARNING",
                claim.line,
                claim.col,
                f"parcel {block.name}: organic conversion not checked, {out['reason']}.",
                "Record the dates so the conversion anchor can be checked.",
            )
        )
    return out


ZONE_MAX_VARIETIES = 3


def _zone_rules(contract: dict[str, Any], farm: Block | None, diags: list[dict[str, Any]]) -> None:
    """Rice Export Zone rules (B-AG-9); the organic and record rules stay warnings until checked."""
    zone = contract["farm"].get("zone")
    if not zone or farm is None:
        return
    varieties = sorted({str(p["crop"]) for p in contract["parcels"] if p.get("crop")})
    if len(varieties) > ZONE_MAX_VARIETIES:
        diags.append(
            _diag(
                "AGRI-E032",
                "ERROR",
                farm.line,
                1,
                f"zone {zone} allows at most {ZONE_MAX_VARIETIES} varieties; this farm grows "
                f"{len(varieties)}: {', '.join(varieties)}.",
                "Keep the zone's agreed varieties and move the others out of the zone contract.",
            )
        )
    for p in contract["parcels"]:
        if safety.resolve_standard(p.get("standard")) is None:
            diags.append(
                _diag(
                    "AGRI-W030",
                    "WARNING",
                    farm.line,
                    1,
                    f"parcel {p['id']} in zone {zone} has no organic standard; zone contracts may "
                    "ask for organic inputs and a 3-season record (TO VERIFY against the "
                    "Ministry of Commerce directive).",
                    "Declare the parcel's standard and keep three seasons of input records.",
                )
            )


def _build(root: Block, diags: list[dict[str, Any]]) -> dict[str, Any] | None:
    farm = next((b for b in root.blocks if b.type == "farm"), None)
    parcels = [b for b in root.blocks if b.type == "parcel"]
    if farm is None and not parcels:
        return None
    standard = _scalar(farm, "standard") if farm else None
    location = _scalar(farm, "location") or _scalar(farm, "coordinates") if farm else None
    legacy = next(
        (f.value for k, f in _fields(root) if k == "water_regime" and isinstance(f.value, Block)),
        None,
    )
    contract: dict[str, Any] = {
        "farm": {
            "id": farm.name if farm else None,
            "name": _scalar(farm, "name") if farm else None,
            "country": _scalar(farm, "country") if farm else None,
            "location": location,
            "standard": standard,
            "zone": _scalar(farm, "zone") if farm else None,
            "terms": _terms(farm, diags) if farm else {},
        },
        "parcels": [],
        "assets": [],
    }
    for block in parcels:
        area = block.fields.get("area")
        boundary = _boundary(block, diags)
        if area is not None and boundary:
            declared = _convert(area, "ha", diags, "area")
            drawn = ring_area_ha(boundary)
            if isinstance(declared, float) and geometry.area_mismatch(declared, drawn):
                diags.append(
                    _diag(
                        "AGRI-W033",
                        "WARNING",
                        area.line,
                        area.col,
                        f"parcel {block.name}: area says {declared} ha, the boundary measures "
                        f"{drawn} ha.",
                        "Check which is right; plans use the declared area.",
                    )
                )
        contract["parcels"].append(
            {
                "id": block.name,
                "boundary": boundary,
                "boundary_area_ha": ring_area_ha(boundary) if boundary else None,
                "osm": _scalar(block, "osm"),
                "area_ha": _convert(area, "ha", diags, "area")
                if area
                else (ring_area_ha(boundary) if boundary else None),
                "crop": _scalar(block, "crop"),
                "crop_id": _scalar(block, "crop_id"),
                "stage": _scalar(block, "stage"),
                "planted": _scalar(block, "planted"),
                "harvest": _scalar(block, "harvest"),
                "standard": _scalar(block, "standard") or standard,
                "terms": _terms(block, diags),
                "conversion": _conversion(block, _scalar(block, "standard") or standard, diags),
            }
        )
        if contract["farm"]["standard"] is None:
            contract["farm"]["standard"] = _scalar(block, "standard")
    for block in (b for b in root.blocks if b.type == "asset"):
        contract["assets"].append(
            {
                "id": block.name,
                "kind": _scalar(block, "kind"),
                "label": _scalar(block, "label") or block.name,
                "status": _scalar(block, "status") or "online",
                "serves": _scalar(block, "serves") or [],
            }
        )
    contract["herds"] = [_herd(b, contract, diags) for b in root.blocks if b.type == "herd"]
    _zone_rules(contract, farm, diags)
    if legacy is not None and isinstance(legacy, Block):
        perched = legacy.fields.get("perched_threshold")
        hydro = contract["farm"]["terms"].setdefault("hydrology", {})
        if perched is not None and "trigger_cm" not in hydro:
            hydro["trigger_cm"] = _convert(perched, "cm", diags, "perched_threshold")
    return contract


def has_contract_blocks(text: str) -> bool:
    return re.search(rf"\b({'|'.join(CONTRACT_BLOCKS)})\s*\{{", text) is not None


def verify(text: str) -> dict[str, Any]:
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    diags: list[dict[str, Any]] = []
    try:
        root = parse(text)
    except ParseError as exc:
        strict = has_contract_blocks(text)
        diags.append(
            _diag(
                "AGRI-E001" if strict else "AGRI-W010",
                "ERROR" if strict else "WARNING",
                exc.line,
                exc.col,
                f"Syntax: {exc}.",
                "Fix the syntax so the contract terms can be verified.",
            )
        )
        return {"is_valid": not strict, "contract": None, "diagnostics": diags, "sha256": digest}
    contract = _build(root, diags)
    if contract is not None:
        _invariants(root, contract, diags)
    return {
        "is_valid": not any(d["severity"] == "ERROR" for d in diags),
        "contract": contract,
        "diagnostics": diags,
        "sha256": digest,
    }


def terms_for(contract: dict[str, Any], parcel_id: str | None = None) -> dict[str, Any]:
    merged = {k: dict(v) for k, v in contract["farm"]["terms"].items()}
    parcel = next((p for p in contract["parcels"] if p["id"] == parcel_id), None)
    for key, value in (parcel or {}).get("terms", {}).items():
        merged.setdefault(key, {}).update(value)
    return merged


def to_thresholds(contract: dict[str, Any]) -> dict[str, float]:
    hydro = terms_for(contract).get("hydrology", {})
    out: dict[str, float] = {}
    if hydro.get("trigger_cm") is not None:
        out["awd_safe_depth_cm"] = hydro["trigger_cm"]
    lock = hydro.get("flowering_lock_cm")
    if lock and None not in lock:
        out["flowering_min_depth_cm"], out["flowering_max_depth_cm"] = lock
    if hydro.get("reflood_cm") is not None:
        out["awd_reflood_target_cm"] = hydro["reflood_cm"]
    return out


def gates_for(contract: dict[str, Any], parcel_id: str | None = None) -> dict[str, Any]:
    from .gates import DEFAULT_GATES

    terms = terms_for(contract, parcel_id).get("gates", {})
    return {
        "max_wind_ms": terms.get("max_wind_ms", DEFAULT_GATES["max_wind_ms"]),
        "delta_t_c": tuple(terms.get("delta_t_c") or DEFAULT_GATES["delta_t_c"]),
        "max_rain_6h_mm": terms.get("max_rain_6h_mm", DEFAULT_GATES["max_rain_6h_mm"]),
    }


def patch(text: str, path: str, new_value: str) -> str:
    root = parse(text)
    parts = path.split(".")
    block: Block = root
    for part in parts[:-1]:
        found = next((b for b in block.blocks if part in (b.name, b.type)), None)
        if found is None:
            raise KeyError(f"no block {part!r} in {path!r}")
        block = found
    target = block.fields.get(parts[-1])
    if target is None:
        raise KeyError(f"no field {parts[-1]!r} in {path!r}")
    return text[: target.start] + new_value + text[target.end :]
