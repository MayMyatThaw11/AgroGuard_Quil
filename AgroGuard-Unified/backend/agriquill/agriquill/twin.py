from __future__ import annotations

import math
import threading
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache
from typing import Any

from .data import farm_sites
from .fleet import _fixed, _lcg

SEED = 20261011
MAX_FARMS = 400
SCHEMA_VERSION = "1.0"

KINDS = ("drone", "robot", "tractor", "pump")
STATUSES = ("idle", "busy", "offline", "maintenance")
TASK_STATUSES = ("planned", "travelling", "working", "done", "cancelled")
ACTIONS: dict[str, tuple[str, ...]] = {
    "drone": ("Scout & NDVI scan", "Spot-spray", "Water & thermal survey"),
    "robot": ("Weed between rows", "Soil & leaf sample", "Pest trap check"),
    "tractor": ("Till soil", "Haul harvest", "Deliver inputs", "Repair dike"),
    "pump": ("Run sprinklers", "Flood to +5 cm", "Drain paddy"),
}

TOWNS: tuple[tuple[Any, ...], ...] = (
    ("Myanmar", "Maubin, Ayeyarwady", 16.731, 95.654, 3, "Paw San rice"),
    ("Myanmar", "Pyapon, Ayeyarwady", 16.285, 95.678, 2, "Sin Thu Kha rice"),
    ("Myanmar", "Hinthada, Ayeyarwady", 17.648, 95.457, 2, "Manawthukha rice"),
    ("Myanmar", "Pathein, Ayeyarwady", 16.778, 94.732, 2, "Paw San rice"),
    ("Myanmar", "Taungoo, Bago", 18.94, 96.434, 2, "Sin Thu Kha rice"),
    ("Myanmar", "Shwebo, Sagaing", 22.568, 95.698, 2, "Shwe Bo Paw San"),
    ("Philippines", "Cabanatuan, Nueva Ecija", 15.486, 120.967, 3, "NSIC Rc 222"),
    ("Philippines", "Muñoz, Nueva Ecija", 15.716, 120.903, 2, "NSIC Rc 216"),
    ("Philippines", "Tarlac City, Tarlac", 15.486, 120.59, 2, "NSIC Rc 222"),
    ("Philippines", "Ilagan, Isabela", 17.148, 121.889, 2, "NSIC Rc 160"),
    ("Philippines", "Pototan, Iloilo", 10.943, 122.635, 2, "NSIC Rc 222"),
    ("Thailand", "Suphan Buri", 14.474, 100.122, 3, "RD41"),
    ("Thailand", "Phra Nakhon Si Ayutthaya", 14.353, 100.568, 2, "Pathum Thani 1"),
    ("Thailand", "Nakhon Sawan", 15.704, 100.137, 2, "RD41"),
    ("Thailand", "Ubon Ratchathani", 15.244, 104.848, 2, "Hom Mali 105"),
    ("Thailand", "Roi Et", 16.054, 103.653, 2, "Hom Mali 105"),
    ("Vietnam", "Long Xuyen, An Giang", 10.386, 105.435, 3, "OM 5451"),
    ("Vietnam", "Cao Lanh, Dong Thap", 10.46, 105.633, 2, "OM 18"),
    ("Vietnam", "Can Tho", 10.045, 105.747, 2, "ST25"),
    ("Vietnam", "Soc Trang", 9.603, 105.98, 2, "ST25"),
    ("Vietnam", "Thai Binh", 20.446, 106.336, 2, "Bac Thom 7"),
    ("Cambodia", "Battambang", 13.095, 103.202, 3, "Phka Rumduol"),
    ("Cambodia", "Takeo", 10.99, 104.785, 2, "Sen Kra Ob"),
    ("Cambodia", "Prey Veng", 11.486, 105.325, 2, "Phka Rumduol"),
    ("Laos", "Savannakhet", 16.557, 104.752, 2, "TDK 8"),
    ("Laos", "Vientiane Plain", 18.07, 102.68, 2, "Thadokkham 11"),
    ("Indonesia", "Karawang, West Java", -6.322, 107.338, 3, "Ciherang"),
    ("Indonesia", "Indramayu, West Java", -6.327, 108.32, 2, "Inpari 32"),
    ("Indonesia", "Subang, West Java", -6.571, 107.759, 2, "Ciherang"),
    ("Indonesia", "Ngawi, East Java", -7.404, 111.446, 2, "Inpari 42"),
    ("Malaysia", "Alor Setar, Kedah", 6.121, 100.367, 2, "MR 297"),
    ("Malaysia", "Sekinchan, Selangor", 3.505, 101.105, 2, "MR 220 CL2"),
    ("Brunei", "Wasan, Brunei-Muara", 4.7686, 114.7967, 1, "Sembada 188"),
    ("Timor-Leste", "Maliana, Bobonaro", -8.9917, 125.2197, 1, "Nakroma"),
)
GROUP_NAMES = (
    "Rice Cooperative",
    "Rice Growers",
    "Paddy Collective",
    "Farmers' Group",
    "Seed Farm",
)


def build_fixture(count: int = 100, today: date | None = None) -> dict[str, list[dict[str, Any]]]:
    rand = _lcg(SEED)
    base = today or datetime.now(UTC).date()
    sites = {t[1]: farm_sites.sites_for(t[1]) for t in TOWNS}
    pool = [t for t in TOWNS if sites[t[1]] for _ in range(t[4])]
    taken: dict[str, int] = {}
    farms: list[dict[str, Any]] = []
    if not pool:
        return {"farms": [], "fleet": []}
    for n in range(1, count + 1):
        t = pool[0] if n == 1 else pool[math.floor(rand() * len(pool))]
        town = t[1].split(",")[0]
        site = sites[t[1]][taken.get(t[1], 0) % len(sites[t[1]])]
        taken[t[1]] = taken.get(t[1], 0) + 1
        season_start = 15 + math.floor(rand() * 75)
        paddies = []
        for k in range(8):
            ago = season_start + math.floor(rand() * 35)
            area = _fixed(0.65 + rand() * 0.25, 2)
            seepage = _fixed(2.5 + rand() * 3, 1)
            paddies.append(
                {
                    "id": f"PD-0{k + 1}",
                    "variety": t[5],
                    "transplanted": (base - timedelta(days=ago)).isoformat(),
                    "areaHa": area,
                    "seepageMmDay": seepage,
                }
            )
        name = (
            "Maubin Delta Cooperative"
            if n == 1
            else f"{town} {GROUP_NAMES[math.floor(rand() * len(GROUP_NAMES))]}"
        )
        organic = True if n == 1 else rand() < 0.6
        farms.append(
            {
                "id": f"FM-{n:03d}",
                "name": name,
                "region": t[0],
                "country": t[0],
                "town": t[1],
                "lat": _fixed(site["latitude"], 4),
                "lon": _fixed(site["longitude"], 4),
                "site": {
                    "osm": site["osm"],
                    "areaHa": site["area_ha"],
                    "landuse": site["landuse"],
                    "crop": site["crop"],
                    "landCover": site["land_cover_check"].get("class"),
                },
                "organic": organic,
                "paddies": paddies,
            }
        )
    fleet: list[dict[str, Any]] = []
    countries = list(dict.fromkeys(f["country"] for f in farms))
    drones = robots = tractors = 0
    for country in countries:
        group = [f for f in farms if f["country"] == country]

        def pick(i: int, group: list[dict[str, Any]] = group) -> str:
            return group[(i * 7) % len(group)]["id"]

        per = max(1, round(len(group) / 6))
        for i in range(per + 1):
            drones += 1
            fleet.append(
                {
                    "id": f"D-{drones:02d}",
                    "kind": "drone",
                    "model": "Agras-class 10 L",
                    "status": "maintenance" if drones == 9 else "idle",
                    "farmId": "FM-001" if drones == 1 else pick(i),
                    "speedKmh": 40,
                    "rangeKm": 8,
                    "ratesHaPerHour": {
                        "Scout & NDVI scan": 7.5,
                        "Spot-spray": 4,
                        "Water & thermal survey": 7.5,
                    },
                }
            )
        for i in range(per):
            robots += 1
            fleet.append(
                {
                    "id": f"R-{robots:02d}",
                    "kind": "robot",
                    "model": "Row weeder",
                    "status": "offline" if robots == 6 else "idle",
                    "farmId": "FM-001" if robots == 1 else pick(i + 3),
                    "speedKmh": 25,
                    "ratesHaPerHour": {
                        "Weed between rows": 0.25,
                        "Soil & leaf sample": 1.5,
                        "Pest trap check": 3,
                    },
                }
            )
        for i in range(per + 1):
            tractors += 1
            fleet.append(
                {
                    "id": f"T-{tractors:02d}",
                    "kind": "tractor",
                    "model": "35 hp + 1.2 t trailer",
                    "status": "idle",
                    "farmId": "FM-001" if tractors == 1 else pick(i + 5),
                    "speedKmh": 25,
                    "ratesHaPerHour": {
                        "Till soil": 0.6,
                        "Haul harvest": 0.8,
                        "Deliver inputs": 3,
                        "Repair dike": 1.2,
                    },
                }
            )
    for i, farm in enumerate(farms):
        fleet.append(
            {
                "id": f"P-{i + 1:03d}",
                "kind": "pump",
                "model": "Intake pump + 3 impact sprinklers",
                "status": "idle",
                "farmId": farm["id"],
                "flowM3h": 150,
                "ratesHaPerHour": {},
            }
        )
    return {"farms": farms, "fleet": fleet}


@lru_cache(maxsize=8)
def _cached(count: int, day: date) -> dict[str, list[dict[str, Any]]]:
    return build_fixture(count, day)


def fixture(count: int = 100) -> dict[str, list[dict[str, Any]]]:
    return _cached(count, datetime.now(UTC).date())


class TaskStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tasks: list[dict[str, Any]] = []
        self._seq = 0

    def record(self, tasks: list[dict[str, Any]], at: datetime) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        with self._lock:
            for task in tasks:
                self._seq += 1
                stored = {
                    **task,
                    "id": task.get("id") or f"TK-{self._seq:06d}",
                    "status": "planned",
                    "simulated": True,
                    "recordedAt": at.isoformat(),
                }
                self._tasks.append(stored)
                out.append(stored)
        return out

    def since(self, moment: datetime | None) -> list[dict[str, Any]]:
        with self._lock:
            if moment is None:
                return list(self._tasks)
            return [t for t in self._tasks if datetime.fromisoformat(t["recordedAt"]) >= moment]

    def clear(self) -> None:
        with self._lock:
            self._tasks.clear()
            self._seq = 0


def parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def validate_tasks(
    raw: Any, farms: dict[str, dict[str, Any]], machines: dict[str, dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    issues: list[dict[str, str]] = []
    accepted: list[dict[str, Any]] = []
    if not isinstance(raw, list):
        return [], [{"path": "body", "msg": "expected a list of tasks"}]
    for i, item in enumerate(raw):
        path = f"tasks[{i}]"
        if not isinstance(item, dict):
            issues.append({"path": path, "msg": "task must be an object"})
            continue
        machine = machines.get(str(item.get("machineId")))
        farm = farms.get(str(item.get("farmId")))
        if machine is None:
            issues.append(
                {"path": path, "msg": f"machineId {item.get('machineId')!r} not in /fleet"}
            )
            continue
        if farm is None:
            issues.append({"path": path, "msg": f"farmId {item.get('farmId')!r} not in /farms"})
            continue
        action = item.get("action")
        if action not in ACTIONS[machine["kind"]]:
            issues.append(
                {"path": path, "msg": f"action {action!r} is not an action of a {machine['kind']}"}
            )
            continue
        paddy_ids = item.get("paddyIds")
        known = {p["id"] for p in farm["paddies"]}
        if (
            not isinstance(paddy_ids, list)
            or not paddy_ids
            or not all(p in known for p in paddy_ids)
        ):
            issues.append(
                {"path": path, "msg": "paddyIds must be a non-empty list of paddies on that farm"}
            )
            continue
        times = [parse_iso(item.get(k)) for k in ("startAt", "arriveAt", "endAt")]
        if any(t is None for t in times):
            issues.append(
                {"path": path, "msg": "startAt, arriveAt and endAt must be ISO timestamps"}
            )
            continue
        start, arrive, end = times
        if not (start <= arrive <= end):  # type: ignore[operator]
            issues.append({"path": path, "msg": "times must satisfy startAt <= arriveAt <= endAt"})
            continue
        if item.get("status", "planned") not in TASK_STATUSES:
            issues.append({"path": path, "msg": "unknown status"})
            continue
        accepted.append(
            {
                "id": item.get("id") if isinstance(item.get("id"), str) else None,
                "machineId": machine["id"],
                "farmId": farm["id"],
                "paddyIds": list(paddy_ids),
                "action": action,
                "startAt": item["startAt"],
                "arriveAt": item["arriveAt"],
                "endAt": item["endAt"],
            }
        )
    return accepted, issues
