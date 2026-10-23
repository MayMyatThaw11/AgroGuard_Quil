import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Sequence

import numpy as np

SPLIT_NOTE = "test split: held out, never used to choose the checkpoint (the val split is)"


def confusion(labels: Sequence[int], preds: Sequence[int], n: int) -> np.ndarray:
    matrix = np.zeros((n, n), dtype=int)
    np.add.at(matrix, (np.asarray(labels, dtype=int), np.asarray(preds, dtype=int)), 1)
    return matrix


def _ratio(num: int, den: int) -> float | None:
    return round(num / den, 4) if den else None


def eval_report(labels: Sequence[int], preds: Sequence[int], class_names: Sequence[str]) -> dict[str, Any]:
    matrix = confusion(labels, preds, len(class_names))
    hits = np.diag(matrix)
    support = matrix.sum(axis=1)
    predicted = matrix.sum(axis=0)
    per_class = [
        {
            "class": name,
            "support": int(support[i]),
            "recall": _ratio(int(hits[i]), int(support[i])),
            "precision": _ratio(int(hits[i]), int(predicted[i])),
        }
        for i, name in enumerate(class_names)
    ]
    recalls = [hits[i] / support[i] for i in range(len(class_names)) if support[i]]
    return {
        "split": SPLIT_NOTE,
        "test_images": int(matrix.sum()),
        "accuracy": _ratio(int(hits.sum()), int(matrix.sum())),
        "balanced_accuracy": round(float(np.mean(recalls)), 4) if recalls else None,
        "per_class": per_class,
        "confusion": matrix.tolist(),
        "classes_without_test_images": [c["class"] for c in per_class if c["support"] == 0],
    }


def write_eval(save_dir: Path, report: dict[str, Any], meta: dict[str, Any]) -> Path:
    path = save_dir / "eval.json"
    body = {**meta, **report, "created_at": datetime.now(UTC).isoformat(timespec="seconds")}
    path.write_text(json.dumps(body, indent=2), encoding="utf-8")
    return path
