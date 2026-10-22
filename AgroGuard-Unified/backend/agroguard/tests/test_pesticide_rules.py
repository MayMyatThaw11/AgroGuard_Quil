import csv
from pathlib import Path

from app.services import pesticide_rules as rules

ADVICE_FILE = (
    Path(__file__).resolve().parents[3]
    / "plant_disease_detection"
    / "app"
    / "ml"
    / "disease_data.py"
)


def test_restricted_list_has_the_seven_names_from_notification_5_2018():
    restricted = {
        r["ingredient"] for r in rules.load_rules().values() if r["status"] == "restricted"
    }
    assert restricted == {
        "Methyl bromide",
        "Aluminium phosphide",
        "Magnesium phosphide",
        "Bromadiolone",
        "Zinc phosphide",
        "Brodifacoum",
        "Fenthion",
    }


def test_banned_list_has_the_41_names_of_notification_6_2018():
    with rules.DATA_FILE.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    named = [r for r in rows if "6/2018" in r["source"]]
    assert len(named) == 41 and all(r["status"] == "banned" for r in named)
    assert len({r["ingredient"] for r in rows}) == len(rows)
    for name in ("Methomyl", "Trichlorfon", "Cyhexatin", "EPN", "Hexachlorobenzene", "2,4,5-T"):
        assert rules.status_of(name) == "banned", name


def test_names_and_aliases_match_however_they_are_written():
    assert rules.status_of("Endosulfan") == "banned"
    assert rules.status_of("  methyl-PARATHION ") == "banned"
    assert rules.status_of("parathion-methyl") == "banned"
    assert rules.status_of("Aluminum phosphide") == "restricted"
    assert rules.status_of("copper oxychloride") is None


def test_mentions_finds_a_banned_name_inside_advice_text():
    text = "Spray monocrotophos or Mancozeb; fumigate stores with aluminium phosphide."
    assert rules.mentions(text) == [
        ("Aluminium phosphide", "restricted"),
        ("Monocrotophos", "banned"),
    ]
    assert rules.mentions("Apply copper oxychloride or mancozeb as directed.") == []


def test_current_advice_text_names_no_banned_or_restricted_ingredient():
    # Guards the existing generic advice in the disease service until it is replaced.
    assert ADVICE_FILE.exists()
    assert rules.mentions(ADVICE_FILE.read_text(encoding="utf-8")) == []
