from agriquill import cropvalue


def spec(country, *parcels):
    return {"farm": {"country": country}, "parcels": list(parcels)}


def parcel(pid, crop, area):
    return {"id": pid, "crop": crop, "crop_id": None, "area_ha": area}


def fake_yield(iso3, item):
    table = {("THA", "Rice"): 2.98, ("IDN", "Oil palm fruit"): 17.0}
    t = table.get((iso3, item))
    if t is None:
        return {"t_ha": None, "reason": "no FAOSTAT rows match this filter"}
    return {"t_ha": t, "t_ha_5y": [round(t * 0.95, 3), t], "year": 2024}


def test_any_asean_farm_and_size_gets_area_times_national_yield(monkeypatch):
    monkeypatch.setattr(cropvalue, "_yield", fake_yield)
    small = cropvalue.harvest_reference(spec("TH", parcel("a", "Jasmine rice", 0.8)))
    estate = cropvalue.harvest_reference(spec("Indonesia", parcel("b", "Oil palm", 2500)))
    assert small["country_name"] == "Thailand" and small["parcels"][0]["tonnes"] == [2.26, 2.38]
    assert estate["country"] == "IDN" and estate["parcels"][0]["tonnes"] == [40375.0, 42500.0]
    assert "not a forecast" in small["note"]


def test_unknowns_stay_null_with_a_reason(monkeypatch):
    monkeypatch.setattr(cropvalue, "_yield", fake_yield)
    out = cropvalue.harvest_reference(
        spec("MM", parcel("a", "Strawberry", 1), parcel("b", "rice", None))
    )
    reasons = [p["reason"] for p in out["parcels"]]
    assert reasons == ["crop not matched to a FAOSTAT item", "field area unknown"]
    away = cropvalue.harvest_reference(spec("Japan", parcel("a", "rice", 1)))
    assert away["parcels"][0]["tonnes"] is None and "ASEAN" in away["parcels"][0]["reason"]


def test_crop_names_map_to_faostat_items():
    assert cropvalue.crop_option("Paw San Hmwe (Pearl Grain)")["id"] == "rice"
    assert cropvalue.crop_option("rice_fish")["id"] == "rice"
    assert cropvalue.crop_option("Sweet corn")["id"] == "maize"
    assert cropvalue.crop_option("steamed buns") is None
