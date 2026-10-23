import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ml.evaluation import confusion, eval_report, write_eval  # noqa: E402


def test_confusion_counts_true_rows_against_predicted_columns() -> None:
    assert confusion([0, 0, 1, 2], [0, 1, 1, 2], 3).tolist() == [[1, 1, 0], [0, 1, 0], [0, 0, 1]]


def test_report_gives_accuracy_balanced_accuracy_and_per_class_recall() -> None:
    report = eval_report([0, 0, 0, 1], [0, 0, 1, 1], ["blast", "healthy"])
    assert report["test_images"] == 4
    assert report["accuracy"] == 0.75
    assert report["per_class"][0] == {"class": "blast", "support": 3, "recall": 0.6667, "precision": 1.0}
    assert report["balanced_accuracy"] == round((2 / 3 + 1.0) / 2, 4)


def test_a_class_with_no_test_images_has_null_recall_not_zero() -> None:
    report = eval_report([0, 1], [0, 1], ["blast", "brown_spot", "healthy"])
    assert report["per_class"][2]["recall"] is None
    assert report["classes_without_test_images"] == ["healthy"]


def test_eval_file_keeps_the_metadata(tmp_path: Path) -> None:
    path = write_eval(tmp_path, eval_report([0], [0], ["a"]), {"model": "mobilenet_v3_large"})
    body = json.loads(path.read_text(encoding="utf-8"))
    assert body["model"] == "mobilenet_v3_large" and body["accuracy"] == 1.0 and body["created_at"]
