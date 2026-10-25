"""A tiny MCP server on stdio, used by the MCP client tests."""

from __future__ import annotations

import sys

SCRIPT = """
import json, sys

TOOLS = [
    {
        "name": "echo",
        "description": "Echo the text back",
        "inputSchema": {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
    }
]

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    message = json.loads(line)
    if "id" not in message:
        continue
    method = message.get("method")
    params = message.get("params") or {}
    if method == "initialize":
        result = {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "fake-mcp", "version": "0"},
        }
    elif method == "tools/list":
        result = {"tools": TOOLS}
    elif method == "tools/call":
        text = (params.get("arguments") or {}).get("text", "")
        if params.get("name") != "echo":
            result = {"isError": True, "content": [{"type": "text", "text": "unknown tool"}]}
        else:
            result = {"isError": False, "content": [{"type": "text", "text": text}]}
    elif method == "ping":
        result = {}
    else:
        sys.stdout.write(
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": message["id"],
                    "error": {"code": -32601, "message": "method not found"},
                }
            )
            + "\\n"
        )
        sys.stdout.flush()
        continue
    sys.stdout.write(
        json.dumps({"jsonrpc": "2.0", "id": message["id"], "result": result}) + "\\n"
    )
    sys.stdout.flush()
"""


def command() -> list[str]:
    return [sys.executable, "-c", SCRIPT]
