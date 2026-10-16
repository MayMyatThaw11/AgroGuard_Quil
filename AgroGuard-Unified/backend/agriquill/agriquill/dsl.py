from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any

from . import contract
from .safety import all_prohibited_inputs, prohibited_for


@dataclass
class Diagnostic:
    code: str
    severity: str
    line: int
    column: int
    message: str
    recommendation: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def declared_standard(script: str) -> str | None:
    """Public accessor for the script's declared `standard:` value.

    Shared by the linter and the CLI compiler so the two never parse the
    standard differently.
    """
    m = re.search(r"standard\s*:\s*\"?([A-Za-z0-9_]+)\"?", script)
    return m.group(1) if m else None


def lint(script_content: str) -> dict[str, Any]:
    diagnostics: list[Diagnostic] = []
    standard = declared_standard(script_content)
    banned = set(prohibited_for(standard) or ())
    watched = sorted(all_prohibited_inputs())

    if standard is None:
        diagnostics.append(
            Diagnostic(
                "AGRI-W001",
                "WARNING",
                1,
                1,
                "No explicit parcel standard declared.",
                'Declare standard: "ASOA_ORGANIC_V2" (or equivalent).',
            )
        )

    lines = script_content.splitlines() or [""]
    for i, line in enumerate(lines, start=1):
        if line.lstrip().startswith("//"):
            continue
        for token in watched:
            idx = line.find(token)
            if idx != -1:
                if token in banned:
                    diagnostics.append(
                        Diagnostic(
                            "AGRI-E010",
                            "ERROR",
                            i,
                            idx + 1,
                            f"Prohibited input '{token}' under {standard} standard.",
                            "Use organic certified alternatives (compost, azolla).",
                        )
                    )
                else:
                    diagnostics.append(
                        Diagnostic(
                            "AGRI-W002",
                            "WARNING",
                            i,
                            idx + 1,
                            f"'{token}' declared; not prohibited under "
                            f"{standard or 'no standard'}.",
                            "Confirm the parcel standard before relying on this input.",
                        )
                    )

    checked = contract.verify(script_content)
    found = [d.to_dict() for d in diagnostics] + checked["diagnostics"]
    return {
        "is_valid": not any(d["severity"] == "ERROR" for d in found),
        "diagnostics": found,
        "contract": checked["contract"],
        "sha256": checked["sha256"],
    }
