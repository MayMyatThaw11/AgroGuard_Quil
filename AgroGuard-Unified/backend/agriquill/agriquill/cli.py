"""AgriQill command-line interface.

Makes the three commands documented in ``AGENTS.md`` ("Verified Run Commands")
real and executable:

    python -m agriquill.cli lint     ./parcels/field_01_paddy.agri
    python -m agriquill.cli simulate --parcel field_01_paddy --steps 120
    python -m agriquill.cli compile  ./parcels/field_01_paddy.agri \
        --target iso-xml --out ./build/TASK001.XML

Design notes
------------
* The CLI performs no agronomy of its own. ``lint`` delegates to
  :mod:`agriquill.dsl`, ``simulate`` to :mod:`agriquill.sim` and ``compile``
  only serialises already-linted intent. This keeps a single implementation of
  each rule so the CLI and the HTTP API cannot disagree.
* ``compile`` emits a **demonstration** ISO 11783-10 (ISO-XML) fragment. It is
  not schema-validated against a real tractor terminal and is marked
  ``TO VERIFY`` in the output, per ``docs/agriquill/OPEN_QUESTIONS.md`` item 5.
* Exit codes: ``0`` success, ``1`` lint found a blocking diagnostic, ``2``
  usage/IO error. A blocked script must fail the shell so CI can gate on it.
"""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from . import dsl, sim

# Emitted into compiled output so a downstream consumer cannot mistake a demo
# artefact for a validated prescription.
ISO_XML_DEMONSTRATION_NOTE = (
    "AgriQill demonstration ISO-XML. Not schema-validated and not approved for "
    "machine execution. Verify against ISO 11783-10 before use."
)


def _read_script(path: str) -> str:
    """Read a ``.agri`` script, failing closed on a missing or unreadable file."""
    target = Path(path)
    if not target.is_file():
        raise FileNotFoundError(f"script not found: {target}")
    return target.read_text(encoding="utf-8")


def cmd_lint(args: argparse.Namespace) -> int:
    script = _read_script(args.script)
    result = dsl.lint(script)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for diagnostic in result["diagnostics"]:
            print(
                f"{diagnostic['severity']:<7} {diagnostic['code']} "
                f"line {diagnostic['line']}:{diagnostic['column']} {diagnostic['message']}"
            )
            print(f"        fix: {diagnostic['recommendation']}")
        state = "valid" if result["is_valid"] else "BLOCKED"
        print(f"{args.script}: {state} ({len(result['diagnostics'])} diagnostic(s))")
    return 0 if result["is_valid"] else 1


def cmd_simulate(args: argparse.Namespace) -> int:
    result = sim.simulate(parcel_id=args.parcel, days=args.steps)
    if args.json:
        print(json.dumps(result, indent=2))
        return 0
    print(f"parcel       {result['parcel_id']}")
    print(f"engine       {result['engine']} (fixture; not a calibrated crop model)")
    print(f"days         {result['simulation_days']}")
    print(f"peak biomass {result['peak_biomass_t_ha']} t/ha")
    print(f"yield est.   {result['yield_estimate_t_ha']} t/ha [SIMULATED]")
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(f"written      {args.out}")
    return 0


def cmd_compile(args: argparse.Namespace) -> int:
    script = _read_script(args.script)
    lint_result = dsl.lint(script)

    # A blocking diagnostic must stop the compile. Emitting task data from a
    # script that violates its declared standard would turn a compliance block
    # into an executable file.
    blocking = [d for d in lint_result["diagnostics"] if d["severity"] == "ERROR"]
    if blocking:
        msg = f"{args.script}: compile refused, {len(blocking)} blocking diagnostic(s)"
        print(msg, file=sys.stderr)
        for diagnostic in blocking:
            print(
                f"  {diagnostic['code']} line {diagnostic['line']}: {diagnostic['message']}",
                file=sys.stderr,
            )
        return 1

    if args.target != "iso-xml":
        print(f"unsupported target: {args.target}", file=sys.stderr)
        return 2

    # Reuse the linter's own parse of the declared standard rather than
    # re-implementing the same regex in a second place.
    standard = dsl.declared_standard(script) or "UNSPECIFIED"

    task = ET.Element("ISO11783_TaskData", attrib={"VersionMajor": "4", "VersionMinor": "0"})
    ET.SubElement(task, "ManagementSoftware", attrib={"Version": "agriquill-0.1.0"})
    ET.SubElement(task, "Comment", attrib={"Note": ISO_XML_DEMONSTRATION_NOTE})
    ET.SubElement(task, "Parcel", attrib={"A": args.script, "B": standard})

    # Deterministic serialisation: identical inputs must produce identical bytes.
    ET.indent(task, space="  ")
    xml_bytes = ET.tostring(task, encoding="utf-8", xml_declaration=True)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(xml_bytes)
    print(f"{args.script}: compiled to {out_path} (target={args.target}, standard={standard})")
    print(f"NOTE: {ISO_XML_DEMONSTRATION_NOTE}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="agriquill", description="AgriQill CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p_lint = sub.add_parser("lint", help="report blocking diagnostics for a .agri script")
    p_lint.add_argument("script", help="path to a .agri file")
    p_lint.add_argument("--json", action="store_true", help="emit the raw diagnostic payload")
    p_lint.set_defaults(func=cmd_lint)

    p_sim = sub.add_parser("simulate", help="run the deterministic seasonal fixture")
    p_sim.add_argument("--parcel", required=True, help="parcel identifier")
    p_sim.add_argument("--steps", type=int, default=120, help="season days (1-365)")
    p_sim.add_argument("--out", default=None, help="optional path to write the JSON result")
    p_sim.add_argument("--json", action="store_true", help="emit the raw result payload")
    p_sim.set_defaults(func=cmd_simulate)

    p_compile = sub.add_parser("compile", help="compile intent to a task-controller file")
    p_compile.add_argument("script", help="path to a .agri file")
    p_compile.add_argument("--target", default="iso-xml", help="output format (iso-xml)")
    p_compile.add_argument("--out", required=True, help="destination file path")
    p_compile.set_defaults(func=cmd_compile)

    p_smoke = sub.add_parser("data-smoke", help="call every live data source once")
    p_smoke.add_argument("--lat", type=float, default=16.8)
    p_smoke.add_argument("--lon", type=float, default=96.1)
    p_smoke.set_defaults(func=cmd_data_smoke)

    p_sites = sub.add_parser(
        "farm-sites", help="Export the mapped farm sites as a TypeScript module"
    )
    p_sites.add_argument("--ts-out", required=True)
    p_sites.set_defaults(func=cmd_farm_sites)

    p_facts = sub.add_parser(
        "region-facts", help="Export the regional data snapshot as a TypeScript module"
    )
    p_facts.add_argument("--ts-out", required=True)
    p_facts.set_defaults(func=cmd_region_facts)

    p_field = sub.add_parser(
        "field-smoke", help="run contract, live weather, gates, schedule and proposals once"
    )
    p_field.add_argument("--farm", default="farm_ayeyarwady_demo")
    p_field.add_argument(
        "--tube",
        action="append",
        default=[],
        help="log a manual tube reading first, e.g. PD-02-tube=-9.0 (cm)",
    )
    p_field.add_argument("--reporter", default=None, help="name of the person who read the tube")
    p_field.set_defaults(func=cmd_field_smoke)

    p_onboard = sub.add_parser(
        "onboard", help="register a farm from its own boundary file, field sheet and readings"
    )
    p_onboard.add_argument("--farm-id", required=True)
    p_onboard.add_argument("--name", required=True, help="farm or cooperative name")
    p_onboard.add_argument("--country", required=True, help="ISO code, e.g. MM")
    p_onboard.add_argument(
        "--boundaries", default=None, help=".geojson, .kml or .kmz field polygons"
    )
    p_onboard.add_argument("--fields", default=None, help="field sheet .csv")
    p_onboard.add_argument("--readings", default=None, help="water readings .csv")
    p_onboard.add_argument("--inputs", default=None, help="spray and fertiliser records .csv")
    p_onboard.add_argument("--utc-offset", default=None, help="for times without one, e.g. +06:30")
    p_onboard.add_argument("--standard", default=None, help="e.g. ASOA_ORGANIC")
    p_onboard.add_argument("--by", required=True, help="name of the person registering the farm")
    p_onboard.add_argument("--out", default=None, help="also write the contract .agri here")
    p_onboard.set_defaults(func=cmd_onboard)

    p_check = sub.add_parser(
        "farm-check", help="score the water model on the farm's readings and plan today"
    )
    p_check.add_argument("--farm", required=True)
    p_check.add_argument("--out", default=None, help="write the report as Markdown here")
    p_check.set_defaults(func=cmd_farm_check)

    return parser


def cmd_onboard(args: argparse.Namespace) -> int:
    from . import live, onboard

    if not args.boundaries and not args.fields:
        print("FAIL     onboard: give --boundaries, --fields, or both")
        return 1
    try:
        rings = onboard.read_boundaries(Path(args.boundaries)) if args.boundaries else {}
        fields = onboard.read_fields(Path(args.fields)) if args.fields else []
        sources = ", ".join(Path(p).name for p in (args.boundaries, args.fields) if p)
        text, notes = onboard.build_contract(
            args.farm_id, args.name, args.country, fields, rings, sources, args.standard
        )
        registered = live.register(args.farm_id, text, args.by)
    except live.ContractRejected as exc:
        for d in exc.verdict["diagnostics"]:
            if d["severity"] == "ERROR":
                print(f"FAIL     contract line {d['line']}: {d['message']}")
        return 1
    except (ValueError, OSError) as exc:
        print(f"FAIL     onboard: {exc}")
        return 1
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    parcels = registered["contract"]["parcels"]
    digest = registered["sha256"][:12]
    print(f"PASS     contract: {args.farm_id} sha256 {digest}, {len(parcels)} fields")
    for parcel in parcels:
        area = parcel.get("area_ha")
        size = area if area is not None else "?"
        print(f"         {parcel['id']}: {size} ha, {parcel['crop_id']}")
    for note in notes:
        print(f"NOTE     {note}")
    sheets = (
        ("readings", args.readings, onboard.import_readings),
        ("inputs", args.inputs, onboard.import_inputs),
    )
    for label, sheet, importer in sheets:
        if not sheet:
            continue
        out = importer(args.farm_id, Path(sheet), args.utc_offset, args.by)
        status = "PASS" if out["stored"] and not out["rejected"] else "CHECK"
        print(
            f"{status:<8} {label}: {out['stored']} stored, {out['duplicate']} already there, "
            f"{len(out['rejected'])} rejected, {out['assumed_time']} dated without a time"
        )
        for item in out["rejected"][:10]:
            print(f"         line {item['line']}: {item['reason']}")
    print(f"         IDE: http://localhost:3000/?farm={args.farm_id}")
    print(f"         Phone: http://<this-computer>:3000/?field&farm={args.farm_id}")
    return 0


def cmd_farm_check(args: argparse.Namespace) -> int:
    from . import onboard

    try:
        check = onboard.farm_check(args.farm)
    except KeyError:
        print(f"FAIL     contract: no contract for {args.farm}")
        return 1
    bt = check["backtest"]
    overall = bt.get("overall")
    if bt["status"] != "OK":
        print(f"BLOCKED  backtest: {bt['missing'][0]['reason']}")
    elif overall:
        print(
            f"PASS     backtest: {overall['pairs']} pairs, AgriQill {overall['model_mae_cm']} cm "
            f"vs no-change {overall['no_change_mae_cm']} cm, {bt['inflow_events']} inflows counted"
        )
        spray = bt["spray_history"]
        print(
            f"PASS     spray history: {spray['days_without_safe_hour']} of {spray['days']} days "
            "had no safe hour"
        )
    else:
        print("BLOCKED  backtest: every reading pair was an inflow or outside the weather record")
    recent = check["spray_recent"]
    if recent["status"] == "OK":
        print(
            f"PASS     spray last 30 days: {recent['days_without_safe_hour']} of {recent['days']} "
            "days had no safe hour"
        )
    else:
        print(f"BLOCKED  spray last 30 days: {recent['missing'][0]['reason']}")
    records = check["inputs"]
    if records["status"] == "NO_INPUTS":
        print(f"BLOCKED  inputs: {records['missing'][0]['reason']}")
    else:
        apps = records["applications"]
        status = "PASS" if records["status"] == "OK" else "CHECK"
        note = "" if records["status"] == "OK" else f" ({records['missing'][0]['reason']})"
        print(
            f"{status:<8} inputs: {len(apps)} record{'' if len(apps) == 1 else 's'}, "
            f"{records['flagged']} flagged{note}"
        )
    today = check["today"]
    print(
        f"{'PASS' if today['status'] == 'OK' else 'BLOCKED':<8} today: "
        f"{len(today.get('tasks', []))} tasks, {len(check['proposals'])} new proposals"
    )
    ledger = check["ledger"]
    noun = "record" if ledger["entries"] == 1 else "records"
    print(f"{'PASS' if ledger['valid'] else 'FAIL':<8} ledger: {ledger['entries']} {noun}")
    if args.out:
        Path(args.out).write_text(onboard.to_markdown(check), encoding="utf-8")
        print(f"         report: {args.out}")
    return 0 if check["ledger"]["valid"] else 1


def cmd_field_smoke(args: argparse.Namespace) -> int:
    from datetime import UTC, datetime

    from . import live, telemetry

    if args.tube and not args.reporter:
        print("FAIL     tube: --reporter is required with --tube")
        return 1
    for item in args.tube:
        device, _, value = item.partition("=")
        stamp = datetime.now(UTC).isoformat(timespec="seconds")
        out = telemetry.ingest(
            device, stamp, {"water_depth_cm": float(value)}, "manual", args.reporter
        )
        print(
            f"{'PASS' if out['stored'] else 'BLOCKED':<8} tube {device}: {out['rejected'] or value}"
        )
    loaded = live.load(args.farm)
    if loaded is None:
        print(f"FAIL     contract: no contract for {args.farm}")
        return 1
    verdict = loaded[1]
    errors = [d for d in verdict["diagnostics"] if d["severity"] == "ERROR"]
    print(f"{'PASS' if not errors else 'FAIL':<8} contract: sha256 {verdict['sha256'][:12]}")
    if errors:
        return 1
    result = live.watch(args.farm)
    plan = result["live"]
    if plan["status"] != "OK":
        print(f"BLOCKED  weather: {plan['missing']}")
        return 1
    source = plan["weather"]["source"]
    zone = plan["weather"]["timezone"]
    print(f"PASS     weather: {source['provider']} {source['sha256'][:19]} tz {zone}")
    for paddy in plan["paddies"]:
        if paddy.get("source"):
            print(f"PASS     depth {paddy['id']}: {paddy['source']} {paddy.get('now', '')}")
        else:
            print(f"BLOCKED  depth {paddy['id']}: {paddy['missing'][0]['reason']}")
    summary = plan["schedule"]
    print(
        f"{'PASS' if summary['status'] in ('OPTIMAL', 'FEASIBLE') else 'BLOCKED':<8} schedule: "
        f"{summary['status']} scheduled {summary.get('scheduled', 0)} "
        f"blocked {summary.get('blocked', 0)}"
    )
    for task in plan["tasks"]:
        sched = task["schedule"]
        when = sched.get("start") or task.get("blocked_reason") or sched["status"]
        print(f"         {task['title']}: {when}")
    print(f"PASS     proposals: {len(result['proposals'])} new")
    for proposal in result["proposals"]:
        print(f"         {proposal['proposal_id']}: {proposal['text']}")
    return 0


def _block_source(out: dict, block: str) -> dict:
    return {"missing": out["missing"], "source": out[block]["source"]}


def _region_check() -> dict:
    from .data import regions

    out = regions.listing()
    if out["missing"]:
        return out
    stale = [r["town"] for r in out["regions"] if not r["has_snapshot"]]
    if stale:
        return {"missing": [{"field": "regions", "reason": f"no snapshot for {len(stale)} towns"}]}
    first = regions.get(out["regions"][0]["town"])
    evaporation = first.get("evaporation") or {}
    if not evaporation.get("annual"):
        return {"missing": [{"field": "evaporation", "reason": "snapshot lacks the GLEAM block"}]}
    return {"missing": [], "source": first["rainfall"]["source"]}


def cmd_region_facts(args: argparse.Namespace) -> int:
    from .data import regions

    Path(args.ts_out).write_text(regions.to_typescript(), encoding="utf-8")
    return 0


def cmd_farm_sites(args: argparse.Namespace) -> int:
    from .data import farm_sites

    Path(args.ts_out).write_text(farm_sites.to_typescript(), encoding="utf-8")
    return 0


def cmd_data_smoke(args: argparse.Namespace) -> int:
    from datetime import date

    from .data import chirps, fao_pack, gfw_forest, gfw_marine, gleam, nasapower

    checks = {
        "nasa_power": lambda: nasapower.daily(
            args.lat, args.lon, date(2024, 1, 1), date(2024, 1, 3)
        ),
        "et0_fao56": lambda: nasapower.et0(args.lat, args.lon, date(2024, 1, 2)),
        "chirps": lambda: chirps.rainfall(args.lat, args.lon, date(2024, 7, 1), date(2024, 7, 31)),
        "faostat_live": lambda: fao_pack.faostat_live("MMR", "27", "Yield", 2022, 2022),
        "faostat_pack": lambda: fao_pack.faostat_qcl("MMR", "27", "Yield", 2022, 2022),
        "crop_calendar": lambda: fao_pack.crop_calendar("MMR", "rice"),
        "region_snapshot": lambda: _region_check(),
        "gfw_forest": lambda: _block_source(
            gfw_forest.compliance(args.lat, args.lon, 1.0), "tree_cover_loss"
        ),
        "gfw_search": lambda: gfw_forest.search_datasets("aquaculture", 3),
        "gfw_marine": lambda: _block_source(
            gfw_marine.coastal_vessels(9.15, 106.2, 30), "fishing_effort"
        ),
        "gleam": lambda: gleam.stress(args.lat, args.lon),
        "gfw_vessels": lambda: gfw_marine.vessel_search("CAO TAI", 3),
    }
    failed = 0
    for name, check in checks.items():
        try:
            out = check()
        except Exception as exc:
            print(f"FAIL     {name}: {type(exc).__name__}: {exc}")
            failed += 1
            continue
        reasons = [m["reason"] for m in out.get("missing", [])]
        status = "PASS" if out.get("source") and not reasons else "BLOCKED"
        failed += status != "PASS"
        detail = "; ".join(reasons[:2]) or "source " + out["source"]["sha256"][:19]
        print(f"{status:<8} {name}: {detail}")
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
