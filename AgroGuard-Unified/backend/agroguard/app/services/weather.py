import asyncio

from app.services.climate import (
    ClimateUnavailableError,
    fetch_climate,
    fetch_soil_ph,
)

_PCODE_DATA: list[tuple[str, str, str, float, float]] = [
    ("MMR001", "Sagaing Region", "စစ်ကိုင်းတိုင်းဒေသကြီး", 21.88, 95.98),
    ("MMR002", "Bago Region", "ပဲခူးတိုင်းဒေသကြီး", 17.34, 96.48),
    ("MMR003", "Magway Region", "မကွေးတိုင်းဒေသကြီး", 20.15, 94.92),
    ("MMR004", "Mandalay Region", "မန္တလေးတိုင်းဒေသကြီး", 21.98, 96.09),
    ("MMR005", "Tanintharyi Region", "တနင်္သာရီတိုင်းဒေသကြီး", 13.04, 98.56),
    ("MMR006", "Ayeyarwady Region", "ဧရာဝတီတိုင်းဒေသကြီး", 16.77, 94.73),
    ("MMR007", "Kachin State", "ကချင်ပြည်နယ်", 25.57, 97.31),
    ("MMR008", "Kayah State", "ကယားပြည်နယ်", 19.23, 97.26),
    ("MMR009", "Kayin State", "ကရင်ပြည်နယ်", 17.25, 97.80),
    ("MMR010", "Chin State", "ချင်းပြည်နယ်", 22.01, 93.58),
    ("MMR011", "Mon State", "မွန်ပြည်နယ်", 16.32, 97.65),
    ("MMR012", "Rakhine State", "ရခိုင်ပြည်နယ်", 19.74, 93.98),
    ("MMR013", "Shan State (North)", "ရှမ်းပြည်နယ် (မြောက်ပိုင်း)", 22.43, 97.69),
    ("MMR014", "Yangon Region", "ရန်ကုန်တိုင်းဒေသကြီး", 16.87, 96.19),
    ("MMR015", "Nay Pyi Taw", "နေပြည်တော်", 19.75, 96.13),
    ("MMR016", "Shan State (South)", "ရှမ်းပြည်နယ် (တောင်ပိုင်း)", 20.79, 97.04),
    ("MMR017", "Shan State (East)", "ရှမ်းပြည်နယ် (အရှေ့ပိုင်း)", 21.38, 99.61),
    ("MMR018", "Bago Region (East)", "ပဲခူးတိုင်းဒေသကြီး (အရှေ့ပိုင်း)", 17.34, 96.48),
]

PCODE_MAP: dict[str, dict] = {}
for pcode, name_en, name_my, lat, lon in _PCODE_DATA:
    PCODE_MAP[pcode] = {"name_en": name_en, "name_my": name_my, "lat": lat, "lon": lon}

SOIL_PH_MAP = {
    "MMR001": 6.8, "MMR002": 6.2, "MMR003": 7.1, "MMR004": 7.3,
    "MMR005": 5.5, "MMR006": 5.8, "MMR007": 6.5, "MMR008": 6.0,
    "MMR009": 5.7, "MMR010": 6.3, "MMR011": 5.9, "MMR012": 6.6,
    "MMR013": 6.4, "MMR014": 6.2, "MMR015": 6.9, "MMR016": 6.4,
    "MMR017": 6.1, "MMR018": 6.2,
}

def _find_nearest_region(lat: float, lon: float) -> tuple[str, dict]:
    import math

    best_pcode = "MMR014"
    best_dist = float("inf")
    for pcode, info in PCODE_MAP.items():
        dlat = info["lat"] - lat
        dlon = info["lon"] - lon
        dist = math.sqrt(dlat * dlat + dlon * dlon)
        if dist < best_dist:
            best_dist = dist
            best_pcode = pcode
    return best_pcode, PCODE_MAP[best_pcode]


def _generate_advisories(
    temp: float, rainfall: float, humidity: float,
) -> list[dict]:
    advisories = []

    if temp > 38:
        advisories.append({
            "severity": "warning",
            "icon": "🔥",
            "title_en": "Extreme Heat Alert",
            "title_my": "အပူလွန်ကဲသတိပေးချက်",
            "message_en": (
                "Temperatures are very high. Ensure adequate irrigation "
                "and consider shade for sensitive crops."
            ),
            "message_my": (
                "အပူချိန်အလွန်မြင့်မားနေပါသည်။ လုံလောက်သောရေသွင်းမှုသေချာစေပြီး "
                "ထိခိုက်လွယ်သောသီးနှံများအတွက် အရိပ်ပေးပါ။"
            ),
        })
    elif temp < 15:
        advisories.append({
            "severity": "info",
            "icon": "🥶",
            "title_en": "Cool Weather Advisory",
            "title_my": "အေးမြသောရာသီဥတုအကြံပြုချက်",
            "message_en": (
                "Cool conditions may slow crop growth. Consider cold-tolerant varieties."
            ),
            "message_my": (
                "အေးမြသောရာသီဥတုသည် သီးနှံကြီးထွားမှုကို နှေးကွေးစေနိုင်ပါသည်။ "
                "အအေးဒဏ်ခံနိုင်သောမျိုးများကို စဉ်းစားပါ။"
            ),
        })

    if rainfall > 200:
        advisories.append({
            "severity": "warning",
            "icon": "🌧️",
            "title_en": "Heavy Rainfall Warning",
            "title_my": "မိုးသည်းထန်စွာရွာသွန်းမှုသတိပေးချက်",
            "message_en": (
                "Very high rainfall detected. Ensure proper drainage to prevent waterlogging."
            ),
            "message_my": (
                "မိုးရေချိန်အလွန်များနေပါသည်။ ရေဝပ်ခြင်းကိုကာကွယ်ရန် "
                "ရေနုတ်မြောင်းကောင်းမွန်စွာထားပါ။"
            ),
        })
    elif rainfall < 20:
        advisories.append({
            "severity": "warning",
            "icon": "🏜️",
            "title_en": "Dry Conditions Alert",
            "title_my": "ခြောက်သွေ့မှုသတိပေးချက်",
            "message_en": (
                "Low rainfall detected. Increase irrigation frequency "
                "and consider drought-resistant crops."
            ),
            "message_my": (
                "မိုးရေချိန်နည်းပါးနေပါသည်။ ရေသွင်းနှုန်းတိုးမြှင့်ပြီး "
                "မိုးခေါင်ဒဏ်ခံနိုင်သော သီးနှံများကို စဉ်းစားပါ။"
            ),
        })

    if humidity > 80:
        advisories.append({
            "severity": "info",
            "icon": "💧",
            "title_en": "High Humidity Advisory",
            "title_my": "စိုထိုင်းဆများခြင်းအကြံပြုချက်",
            "message_en": (
                "High humidity increases risk of fungal diseases. Monitor crops closely."
            ),
            "message_my": (
                "စိုထိုင်းဆများခြင်းသည် မှိုရောဂါဖြစ်နိုင်ခြေကိုမြင့်စေပါသည်။ "
                "သီးနှံများကို အနီးကပ်စောင့်ကြည့်ပါ။"
            ),
        })

    if not advisories:
        advisories.append({
            "severity": "info",
            "icon": "✅",
            "title_en": "Favorable Conditions",
            "title_my": "သင့်တော်သောအခြေအနေများ",
            "message_en": "Current conditions are generally favorable for crop growth.",
            "message_my": (
                "လက်ရှိအခြေအနေများသည် သီးနှံစိုက်ပျိုးရန်အတွက် "
                "ယေဘုယျအားဖြင့် သင့်တော်ပါသည်။"
            ),
        })

    return advisories


# Myanmar's bounding box, plus how far (degrees) the nearest region centre may be.
_MYANMAR_BOX = (9.5, 28.6, 92.0, 101.3)  # lat min, lat max, lon min, lon max
_MAX_REGION_DISTANCE_DEG = 4.5
_OUTSIDE = {"name_en": "Outside Myanmar", "name_my": "မြန်မာနိုင်ငံပြင်ပ"}
_WEEKS_PER_YEAR = 52.18


def _in_myanmar(lat: float, lon: float, region: dict) -> bool:
    import math

    lat_min, lat_max, lon_min, lon_max = _MYANMAR_BOX
    if not (lat_min <= lat <= lat_max and lon_min <= lon <= lon_max):
        return False
    return math.hypot(region["lat"] - lat, region["lon"] - lon) <= _MAX_REGION_DISTANCE_DEG


async def get_location_weather(lat: float, lon: float, language: str) -> dict:
    """Climate and soil pH for a point.

    Temperature, annual rainfall and humidity come from NASA POWER, soil pH
    from SoilGrids; inside Myanmar the old regional pH table is the last
    resort for pH. Raises ClimateUnavailableError if NASA POWER has nothing.
    """
    pcode, region = _find_nearest_region(lat, lon)
    in_myanmar = _in_myanmar(lat, lon, region)

    # The two lookups are independent, so run them side by side.
    climate_result, soil_result = await asyncio.gather(
        fetch_climate(lat, lon), fetch_soil_ph(lat, lon), return_exceptions=True
    )
    if isinstance(climate_result, ClimateUnavailableError):
        raise climate_result
    if isinstance(climate_result, BaseException):
        raise ClimateUnavailableError("Climate data could not be loaded.") from climate_result
    climate = climate_result
    soil = None if isinstance(soil_result, BaseException) else soil_result

    if soil is not None:
        soil_ph, soil_source = soil.value, "soilgrids"
    elif in_myanmar:
        soil_ph, soil_source = SOIL_PH_MAP.get(pcode, 6.5), "regional_estimate"
    else:
        soil_ph, soil_source = None, "unavailable"

    weekly_rain = climate.rainfall_annual_mm / _WEEKS_PER_YEAR
    return {
        "region": {
            "name_en": region["name_en"] if in_myanmar else _OUTSIDE["name_en"],
            "name_my": region["name_my"] if in_myanmar else _OUTSIDE["name_my"],
            "in_myanmar": in_myanmar,
        },
        "current": {
            "temperature_c": climate.temperature_c,
            "rainfall_7d_mm": round(weekly_rain, 1),
            "rainfall_annual_mm": climate.rainfall_annual_mm,
            "humidity_pct": climate.humidity_pct,
            "soil_pH_estimate": soil_ph,
            "climate_source": "NASA POWER climatology (long-term annual mean)",
            "soil_ph_source": soil_source,
        },
        "advisories": _generate_advisories(
            climate.temperature_c, weekly_rain, climate.humidity_pct
        ),
    }
