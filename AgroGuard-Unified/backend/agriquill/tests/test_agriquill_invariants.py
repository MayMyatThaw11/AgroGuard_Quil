import calendar
import math
import random
from datetime import UTC, date, datetime, timedelta
from functools import cache

from agriquill import conversion, flows, fusion, gates, schedule
from agriquill.agronomy import STAGE_KC
from agriquill.config import get_settings

CASES = 1000
START = date(2026, 10, 14)


def weather(rng, days):
    n = days * 24
    hourly = {
        "time": [f"{START + timedelta(days=d)}T{h:02d}:00" for d in range(days) for h in range(24)],
        "temperature_2m": [round(rng.uniform(18, 38), 1) for _ in range(n)],
        "relative_humidity_2m": [round(rng.uniform(30, 98), 1) for _ in range(n)],
        "precipitation": [rng.choice((0.0, 0.0, 0.0, 0.4, 2.5, 7.0)) for _ in range(n)],
        "wind_speed_10m": [round(rng.uniform(0, 7.5), 1) for _ in range(n)],
        "is_day": [1 if 6 <= i % 24 <= 18 else 0 for i in range(n)],
    }
    if rng.random() < 0.5:
        hourly["wet_bulb_temperature_2m"] = [
            round(t - rng.uniform(0, 10), 1) for t in hourly["temperature_2m"]
        ]
    for _ in range(rng.randint(0, 3)):
        hourly["wind_speed_10m"][rng.randrange(n)] = None
    return hourly


ACTIONS = (
    ("drone_pilot", "drone", "spray"),
    ("drone_pilot", "drone", "scout_flight"),
    ("water_steward", "irrigation_valve", "open"),
    ("water_steward", "sluice_gate", "open"),
)


def job(rng, n, days, paddies, assets):
    agent, target, command = rng.choice(ACTIONS)
    return {
        "id": f"t{n}",
        "agent": agent,
        "date": str(START + timedelta(days=rng.randrange(days))),
        "priority": rng.choice(("high", "medium", "low")),
        "paddy_id": rng.choice(paddies),
        "asset_id": rng.choice(assets),
        "actuation": {"target": target, "command": command},
        "duration_h": rng.choice((None, 1, 2, 3)),
        "blocked_reason": None,
    }


def gate_failure(hourly, i, kind, rules):
    settings = get_settings()
    if kind == "any":
        return None
    ceiling = min(rules["max_wind_ms"], settings.wind_ceiling_ms)
    if kind == "spray":
        ceiling = min(ceiling, settings.spray_wind_advisory_ms)
    wind = hourly["wind_speed_10m"][i]
    if wind is None or wind > ceiling:
        return f"wind {wind} over {ceiling}"
    if kind == "spray":
        t, rh = hourly["temperature_2m"][i], hourly["relative_humidity_2m"][i]
        wet = (hourly.get("wet_bulb_temperature_2m") or [None] * len(hourly["time"]))[i]
        wet = gates.wet_bulb_stull(t, rh) if wet is None else wet
        lo, hi = rules["delta_t_c"]
        if wet is None or not lo <= round(t - wet, 2) <= hi:
            return f"delta T {t} - {wet} outside {lo}..{hi}"
    return None


def washout_failure(hourly, start, end, limit):
    window = hourly["precipitation"][start : end + gates.WASHOUT_HOURS]
    if len(window) < end - start + gates.WASHOUT_HOURS:
        return "washout window runs past the forecast"
    if round(sum(window), 2) > limit:
        return f"washout {sum(window)} mm over {limit}"
    return None


def travel(a, b, kmh):
    if a is None or b is None:
        return 0
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return math.floor(2 * 6371.0088 * math.asin(math.sqrt(h)) / kmh + 0.5)


@cache
def plans():
    """One CP-SAT solve per seed, shared by the gate and the overlap invariants."""
    out = []
    for case in range(CASES):
        seed = 1000 + case
        rng = random.Random(seed)
        days = rng.randint(2, 3)
        hourly = weather(rng, days)
        paddies = [f"PD-{i}" for i in range(rng.randint(2, 5))]
        rules = {
            p: {
                "max_wind_ms": round(rng.uniform(2.0, 7.0), 1),
                "delta_t_c": (round(rng.uniform(0.5, 3.0), 1), round(rng.uniform(5.0, 9.0), 1)),
                "max_rain_6h_mm": round(rng.uniform(1.0, 15.0), 1),
            }
            for p in paddies
        }
        positions = {
            p: (16.0 + rng.uniform(0, 0.15), 95.0 + rng.uniform(0, 0.15))
            for p in paddies
            if rng.random() < 0.9
        }
        kmh = rng.choice((3.0, 5.0, 12.0, 30.0))
        crew = rng.choice((None, 1, 1, 2))
        tasks = [
            job(rng, n, days, paddies, ["D-01", "P-01", "P-02"]) for n in range(rng.randint(1, 6))
        ]
        if rng.random() < 0.3:
            rng.choice(tasks)["blocked_reason"] = "SAFETY:operator hold"
        solved = schedule.solve(
            tasks, hourly, rules, crew=crew, positions=positions, travel_kmh=kmh
        )
        case_info = {
            "where": f"seed={seed} case={case} crew={crew} kmh={kmh}",
            "hourly": hourly,
            "rules": rules,
            "positions": positions,
            "kmh": kmh,
            "crew": crew,
            "held": {t["id"] for t in tasks if t["blocked_reason"]},
            "tasks": solved["tasks"],
        }
        out.append(case_info)
    return out


def test_a_gate_blocked_job_is_never_scheduled():
    scheduled = 0
    for plan in plans():
        hourly, rules = plan["hourly"], plan["rules"]
        n = len(hourly["time"])
        for t in plan["tasks"]:
            sched = t["schedule"]
            where = f"{plan['where']} task={t['id']} schedule={sched}"
            if t["id"] in plan["held"]:
                assert sched["status"] == "blocked", where
            if sched["status"] != "scheduled":
                continue
            scheduled += 1
            s, d = sched["start_index"], sched["duration_h"]
            kind = schedule.gate_kind(t, sched["kind"])
            assert s + d <= n, where
            assert all(hourly["is_day"][s : s + d]), f"outside daylight: {where}"
            for i in range(s, s + d):
                failure = gate_failure(hourly, i, kind, rules[t["paddy_id"]])
                assert failure is None, f"{failure} at hour {i}: {where}"
            if kind == "spray":
                failure = washout_failure(hourly, s, s + d, rules[t["paddy_id"]]["max_rain_6h_mm"])
                assert failure is None, f"{failure}: {where}"
            day = (date.fromisoformat(t["date"]) - START).days
            first = 0 if sched["kind"] == "irrigate" else day
            last = day + schedule.SLACK_DAYS[sched["kind"]]
            assert first <= s // 24 <= last, f"outside the task's day window: {where}"
    assert scheduled > CASES, "the generator should schedule more than one job per case on average"


def test_no_crew_job_overlaps_another_once_travel_is_included():
    pairs = 0
    for plan in plans():
        positions, kmh = plan["positions"], plan["kmh"]
        done = sorted(
            (t for t in plan["tasks"] if t["schedule"]["status"] == "scheduled"),
            key=lambda t: t["schedule"]["start_index"],
        )
        for n, a in enumerate(done):
            for b in done[n + 1 :]:
                if plan["crew"] != 1 and a["asset_id"] != b["asset_id"]:
                    continue
                pairs += 1
                gap = (
                    0
                    if a["paddy_id"] == b["paddy_id"]
                    else travel(positions.get(a["paddy_id"]), positions.get(b["paddy_id"]), kmh)
                )
                end = a["schedule"]["start_index"] + a["schedule"]["duration_h"]
                assert b["schedule"]["start_index"] >= end + gap, (
                    f"{plan['where']} {a['id']}@{a['paddy_id']} ends {end}, "
                    f"{b['id']}@{b['paddy_id']} starts {b['schedule']['start_index']}, "
                    f"travel {gap} h"
                )
    assert pairs > CASES / 2


def depth_hourly(rng, hours):
    start = datetime(2026, 10, 1)
    return {
        "time": [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(hours)],
        "precipitation": [
            rng.choice((0.0, 0.0, 0.0, round(rng.uniform(0, 20), 1))) for _ in range(hours)
        ],
        "et0_fao_evapotranspiration": [round(rng.uniform(0, 0.6), 2) for _ in range(hours)],
    }


def reading(hour, value, source):
    stamp = (datetime(2026, 10, 1, tzinfo=UTC) + timedelta(hours=hour)).isoformat()
    return {"observed_at": stamp, "value": value, "source": source}


def test_fused_depth_stays_inside_the_water_balance_envelope_of_its_readings():
    known = 0
    for case in range(CASES):
        seed = 9000 + case
        rng = random.Random(seed)
        hours = rng.randint(24, 120)
        hourly = depth_hourly(rng, hours)
        kc, perc = rng.uniform(0.5, 1.3), rng.uniform(0.0, 8.0)
        at = sorted(rng.sample(range(hours), rng.randint(1, 6)))
        depth, rows = rng.uniform(-25, 10), []
        for h in at:
            depth += rng.choice(
                (rng.uniform(-1.5, 1.5), rng.uniform(-1.5, 1.5), rng.uniform(-20, 20))
            )
            rows.append(reading(h, round(depth, 1), rng.choice(("lorawan:ttn", "manual"))))
        now_index = rng.randint(at[-1], hours - 1)
        out = fusion.kalman_depth(rows, hourly, 0, now_index, kc, perc)
        where = f"seed={seed} case={case} readings={rows} now_index={now_index}"
        if out["now"] is None:
            assert out["reason"], where
            continue
        known += 1
        steps = [
            (hourly["precipitation"][i] - hourly["et0_fao_evapotranspiration"][i] * kc - perc / 24)
            / 10
            for i in range(at[0], hours)
        ]
        values = [r["value"] for r in rows]
        lo = min(values) + sum(s for s in steps if s < 0) - 0.01
        hi = max(values) + sum(s for s in steps if s > 0) + 0.01
        assert lo <= out["now"] <= hi, f"now {out['now']} outside {lo:.2f}..{hi:.2f}: {where}"
        assert all(lo <= p["depth_cm"] <= hi for p in out["past"]), where
        assert out["sigma_cm"] >= 0, where
        band = out["band"]
        assert all(
            a <= b <= c for a, b, c in zip(band["p10"], band["p50"], band["p90"], strict=True)
        ), where
    assert known > CASES / 2


def drift(et0, kc, perc, a, b):
    return sum(-(et0[i] * kc + perc / 24) / 10 for i in range(a, b))


def test_a_jump_contradicted_within_the_window_leaves_the_depth_unknown():
    for case in range(CASES):
        seed = 13000 + case
        rng = random.Random(seed)
        hourly = depth_hourly(rng, 160)
        hourly["precipitation"] = [0.0] * 160
        kc, perc = rng.uniform(0.5, 1.3), rng.uniform(0.0, 5.0)
        source = rng.choice(("lorawan:ttn", "manual"))
        h0 = rng.randint(0, 10)
        h1 = h0 + rng.randint(1, 40)
        h2 = h1 + rng.randint(1, fusion.CONFIRM_WINDOW_H - 6)
        base = round(rng.uniform(-20, 5), 1)
        jump = rng.choice((-1, 1)) * round(rng.uniform(15, 30), 1)
        et0 = hourly["et0_fao_evapotranspiration"]

        agree = case % 2 == 1
        if agree:
            third = base + jump + drift(et0, kc, perc, h1, h2) + rng.uniform(-0.5, 0.5)
        else:
            third = base + drift(et0, kc, perc, h0, h2) + rng.uniform(-1, 1)
        rows = [reading(h0, base, source), reading(h1, round(base + jump, 1), source)]
        rows.append(reading(h2, round(third, 1), source))
        out = fusion.kalman_depth(rows, hourly, 0, rng.randint(h2, 159), kc, perc)
        where = f"seed={seed} case={case} readings={rows}"
        flag = next(
            (f for f in out.get("flags", []) if f["observed_at"] == rows[1]["observed_at"]), None
        )
        assert flag is not None, f"the jump was not flagged: {where}"
        if agree:
            assert flag["status"] == "confirmed" and out["now"] is not None, where
        else:
            assert out["now"] is None, f"conflict guessed as {out['now']}: {where}"
            assert out["reason"].startswith("unknown: conflicting readings"), where
            assert flag["status"] == "conflicting", where


def test_flows_close_their_mass_balance():
    stages = [*STAGE_KC, None, "Unknown stage"]
    for case in range(CASES):
        seed = 17000 + case
        rng = random.Random(seed)
        days = [
            {
                "date": str(START + timedelta(days=d)),
                "rain_mm": round(rng.choice((0.0, rng.uniform(0, 80))), 2),
                "et0_mm": round(rng.uniform(0, 8), 2),
                "u2_ms": round(rng.uniform(0, 6), 2),
                "rh_min_pct": round(rng.uniform(15, 100), 1),
            }
            for d in range(rng.randint(1, 30))
        ]
        perc = rng.choice((None, round(rng.uniform(0, 12), 1)))
        levels = {d["date"]: round(rng.uniform(-30, 10), 1) for d in days if rng.random() < 0.8}
        fc = rng.uniform(0.25, 0.45)
        soil = rng.choice((None, {"theta_fc": fc, "theta_wp": fc - rng.uniform(0.05, 0.2)}))
        out = flows.water({"stage": rng.choice(stages)}, days, perc, levels, soil)
        where = f"seed={seed} case={case} perc={perc} days={len(days)} soil={soil}"
        total = out["total"]
        for key in ("rain_mm", "transpiration_mm", "evaporation_mm"):
            assert abs(total[key] - sum(r[key] for r in out["days"])) <= 0.05 + 1e-9, where
        for row, day in zip(out["days"], days, strict=True):
            stress = row["ks"]["value"]
            assert stress is None or 0.0 <= stress <= 1.0, where
            assert 0 <= row["transpiration_mm"] <= row["kc"]["kcb"] * day["et0_mm"] + 0.005, where
            assert row["evaporation_mm"] >= 0, where
        if perc is None:
            assert out["net_mm"] is None, where
            assert "percolation_mm" in {m["field"] for m in out["unknown"]}, where
            continue
        outflow = total["transpiration_mm"] + total["evaporation_mm"] + total["percolation_mm"]
        assert abs(out["net_mm"] - (total["rain_mm"] - outflow)) <= 0.1, where
        exact = sum(r["rain_mm"] - r["transpiration_mm"] - r["evaporation_mm"] for r in out["days"])
        assert abs(out["net_mm"] - (exact - perc * len(days))) <= 0.25 + 1e-9, where
        area = round(rng.uniform(0.05, 20), 2)
        ch4 = flows.methane({}, rng.choice(("AWD_SAFE", "CONTINUOUS", "SINGLE", "RAINFED")), area)
        assert abs(ch4["farm_kg"] - ch4["kg_ha"] * area) <= 0.05 + 1e-9, where


def test_conversion_dates_are_stable_around_month_ends():
    for case in range(CASES):
        seed = 21000 + case
        rng = random.Random(seed)
        year, month = rng.randint(2018, 2030), rng.randint(1, 12)
        last = calendar.monthrange(year, month)[1]
        start = date(year, month, min(rng.choice((1, 28, 29, 30, 31)), last))
        months = rng.randint(0, 60)
        where = f"seed={seed} case={case} start={start} months={months}"
        end = conversion.add_months(start, months)
        assert (end.year * 12 + end.month) - (year * 12 + month) == months, where
        assert end.day == min(start.day, calendar.monthrange(end.year, end.month)[1]), where
        assert conversion.add_months(start + timedelta(days=1), months) >= end, where
        if start.day > 1:
            assert conversion.add_months(start - timedelta(days=1), months) <= end, where
        split = rng.randint(0, months)
        assert conversion.add_months(conversion.add_months(start, split), months - split) <= end
        standard = rng.choice(sorted(conversion.RULES))
        rule = conversion.RULES[standard]
        earliest = conversion.add_months(start, rule["months"])
        on_time, early = earliest.isoformat(), (earliest - timedelta(days=1)).isoformat()
        sowing = rule["anchor"] == "sowing"
        ok = conversion.check(
            standard, start.isoformat(), *((on_time, None) if sowing else (None, on_time))
        )
        late = conversion.check(
            standard, start.isoformat(), *((early, None) if sowing else (None, early))
        )
        assert ok["earliest"] == on_time and ok["qualifies"] is True, f"{standard} {where}"
        assert late["qualifies"] is False, f"{standard} {where}"
