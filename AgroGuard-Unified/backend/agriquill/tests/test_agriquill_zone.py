from agriquill import contract


def farm(zone: str | None, crops: list[str], standard: str = "ASOA_ORGANIC") -> str:
    head = f'farm f1 {{\n    name: "Zone farm"\n    standard: {standard}\n'
    head += f"    zone: {zone}\n" if zone else ""
    parcels = "".join(
        f'parcel p{i} {{\n    area: 1 ha\n    crop: "{c}"\n}}\n' for i, c in enumerate(crops)
    )
    return head + "}\n" + parcels


def codes(text: str) -> set[str]:
    return {d["code"] for d in contract.verify(text)["diagnostics"]}


def test_a_fourth_variety_in_an_export_zone_is_an_error():
    assert "AGRI-E032" not in codes(farm("PAWSAN_ZONE_1", ["Paw San Hmwe", "Shwe Bo", "Ayeyarmin"]))
    four = farm("PAWSAN_ZONE_1", ["Paw San Hmwe", "Shwe Bo", "Ayeyarmin", "Sin Thu Kha"])
    assert "AGRI-E032" in codes(four)
    assert contract.verify(four)["is_valid"] is False


def test_a_conventional_parcel_in_a_zone_is_only_a_warning():
    out = contract.verify(farm("PAWSAN_ZONE_1", ["Paw San Hmwe"], standard="none"))
    assert "AGRI-W030" in {d["code"] for d in out["diagnostics"]} and out["is_valid"] is True


def test_no_zone_means_no_zone_rules():
    assert not {"AGRI-E032", "AGRI-W030"} & codes(farm(None, ["a", "b", "c", "d"], "none"))
