from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from . import tools


def _reply(req_id: Any, result: Any = None, error: dict[str, Any] | None = None) -> str:
    msg: dict[str, Any] = {"jsonrpc": "2.0", "id": req_id}
    if error is not None:
        msg["error"] = error
    else:
        msg["result"] = result
    return json.dumps(msg)


READ_ONLY_TOOLS = (
    "soil_query",
    "weather_forecast",
    "crop_catalog",
    "ops_plan_preview",
    "ops_plan_live_preview",
    "contract_verify",
    "field_monitoring_status",
    "crop_options",
    "ecocrop_lookup",
    "ecocrop_screen",
    "faostat_qcl",
    "fao_crop_calendar",
    "chirps_rainfall",
    "nasa_power_daily",
    "et0_fao56",
    "farm_region_data",
    "gleam_evaporation_stress",
    "gleam_daily",
    "gfw_forest_compliance",
    "gfw_dataset_search",
    "gfw_coastal_vessels",
    "gfw_vessel_search",
    "knowledge_search",
    "jobs_status",
    "farm_summary",
    "farm_records_check",
    "proposals_list",
    "proposal_rehearsal",
    "rehearsal_outcomes",
    "farm_location",
)
LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "::1")


def select_tools(allow_actuation: bool) -> dict[str, dict[str, Any]]:
    if allow_actuation:
        return dict(tools.TOOLS)
    return {name: spec for name, spec in tools.TOOLS.items() if name in READ_ONLY_TOOLS}


def handle(
    request: dict[str, Any], catalog: dict[str, dict[str, Any]] = tools.TOOLS
) -> dict[str, Any] | None:
    req_id = request.get("id")
    method = request.get("method")
    params = request.get("params") or {}

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "agriquill-mcp", "version": "0.1.0"},
            },
        }
    if method in ("ping",):
        return {"jsonrpc": "2.0", "id": req_id, "result": {}}
    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "tools": [
                    {
                        "name": name,
                        "description": spec["description"],
                        "inputSchema": spec["input_schema"],
                    }
                    for name, spec in catalog.items()
                ]
            },
        }
    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments", {}) or {}
        spec = catalog.get(name or "")
        if spec is None:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32602, "message": f"unknown tool {name}"},
            }
        try:
            output = spec["fn"](args)
        except Exception as exc:  # surface a tool error, not a protocol crash
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"isError": True, "content": [{"type": "text", "text": str(exc)}]},
            }
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"content": [{"type": "text", "text": json.dumps(output)}], "isError": False},
        }
    if method is not None and method.startswith("notifications/"):
        return None  # notifications get no reply
    if req_id is None:
        return None
    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {"code": -32601, "message": f"method {method} not found"},
    }


def serve_stdio(catalog: dict[str, dict[str, Any]]) -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as exc:
            sys.stdout.write(
                _reply(None, error={"code": -32700, "message": f"parse error: {exc}"}) + "\n"
            )
            sys.stdout.flush()
            continue
        response = handle(request, catalog)
        if response is not None:
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()


INSTRUCTIONS = (
    "AgriQill farm decision support for ASEAN smallholder systems. Tools return evidence and "
    "proposals only. ops_plan_preview never writes to the ledger or moves equipment; every "
    "physical action still needs human approval in the AgriQill IDE. Quote numbers only from "
    "tool results and cite their source; when a value is null, say it is unknown and give the "
    "reason. Never fill a gap from memory. When you hand a result to another agent, pass the "
    "value with its source and any missing reasons, never the value alone. Prefer "
    "farm_region_data for the demo farms; live CHIRPS and GLEAM reads of a new cell can take "
    "a minute, so request each cell once and reuse the answer."
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="agriquill-mcp", description="AgriQill MCP server")
    parser.add_argument("--transport", choices=("stdio", "http"), default="stdio")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--allow-actuation", action="store_true")
    args = parser.parse_args(argv)
    if args.transport == "http" and args.allow_actuation:
        parser.error("actuation tools are stdio-only and are never exposed over HTTP")
    if args.transport == "http" and args.host not in LOOPBACK_HOSTS:
        parser.error(
            f"refusing to serve HTTP on {args.host}: the MCP server has no sign-in, so it only "
            "listens on 127.0.0.1, localhost or ::1"
        )
    return args


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    catalog = select_tools(allow_actuation=args.allow_actuation)
    try:
        from fastmcp import FastMCP  # type: ignore
    except ImportError:
        if args.transport == "http":
            raise SystemExit('HTTP transport needs FastMCP: pip install -e ".[mcp]"') from None
        serve_stdio(catalog)
        return

    mcp = FastMCP("agriquill", instructions=INSTRUCTIONS)
    for name, spec in catalog.items():
        mcp.tool(spec["impl"], name=name, description=spec["description"])
    if args.transport == "http":
        mcp.run(transport="http", host=args.host, port=args.port, path="/mcp", show_banner=False)
    else:
        mcp.run(show_banner=False)


if __name__ == "__main__":
    main()
