import type { Herd, LivePlan, LiveWeatherDay, OpsHistory, OpsPlan, OpsWeatherDay } from '../data/ops/types.ts';

export interface WaterReading {
  value: number | null;
  sigma: number | null;
  source: 'MEASURED' | 'DERIVED' | null;
  reason: string | null;
  deviceId: string | null;
}

export interface LiveView {
  plan: OpsPlan;
  forecastDates: string[];
  forecastWeather: OpsWeatherDay[];
  history: OpsHistory;
  water: Record<string, WaterReading>;
  herds: Herd[];
  sourceLabel: string;
}

function toWeather(day: LiveWeatherDay): OpsWeatherDay {
  return { rainMm: day.rain_mm, tempC: day.temp_c, rhPct: day.rh_pct, windMs: day.wind_ms };
}

export function toLiveView(live: LivePlan): LiveView | null {
  if (live.status !== 'OK' || !live.weather) return null;
  const days = live.weather.days;
  const past = live.weather.past_days;
  const depthCm: Record<string, number[]> = {};
  const ndvi: Record<string, number[]> = {};
  const water: Record<string, WaterReading> = {};
  for (const paddy of live.paddies ?? []) {
    const past = paddy.series ?? [];
    const series = past.length > 0 ? past : paddy.now !== undefined ? [paddy.now] : [];
    depthCm[paddy.id] = series;
    ndvi[paddy.id] = [];
    water[paddy.id] = {
      value: paddy.now ?? null,
      sigma: paddy.sigma_cm ?? null,
      source: paddy.source ?? null,
      reason: paddy.missing[0]?.reason ?? null,
      deviceId: paddy.device_id,
    };
  }
  const plan: OpsPlan = {
    farm_id: live.farm_id,
    forecast: {
      method: 'contract-live',
      fallback_reason: null,
      horizon_days: days.length,
      series: live.forecast_series ?? {},
      backtest: null,
      compute_ms: 0,
      provenance: 'Tube readings (measured) or FAO-56 water balance from the last reading (derived)',
    },
    tasks: live.tasks,
    crew: live.crew ?? [],
    paddies_without_action: [],
    thresholds: live.thresholds ?? {},
    approval_policy: live.approval_policy ?? '',
    ledger_commit_hash: live.ledger_commit_hash ?? '',
    schedule: live.schedule,
  };
  const source = live.weather.source;
  return {
    plan,
    forecastDates: days.map((d) => d.date),
    forecastWeather: days.map(toWeather),
    history: {
      dates: past.map((d) => d.date),
      weather: past.map(toWeather),
      depthCm,
      ndvi,
      today: live.local_now?.slice(0, 10),
    },
    water,
    herds: live.herds ?? [],
    sourceLabel: `${source.provider} · ${source.sha256.slice(0, 19)}${live.weather.stale ? ' · stale' : ''}`,
  };
}

export type Tone = 'ok' | 'watch' | 'act' | 'unknown';

export type WaterCode = 'unknown' | 'ripening' | 'below' | 'soon' | 'ok';

export function waterStatus(
  now: number | null | undefined,
  ahead: number[] | undefined,
  floorCm: number,
  stage: string
): { tone: Tone; label: string; code: WaterCode } {
  if (now === null || now === undefined) return { tone: 'unknown', label: 'Unknown: read the tube', code: 'unknown' };
  if (stage === 'Ripening') return { tone: 'ok', label: 'Ripening: keep it drained', code: 'ripening' };
  if (now <= floorCm) return { tone: 'act', label: 'Below the water floor now', code: 'below' };
  const soon = (ahead ?? []).slice(0, 2).some((v) => v <= floorCm);
  if (soon) return { tone: 'watch', label: 'Will need water in 2 days', code: 'soon' };
  return { tone: 'ok', label: 'Water level fine', code: 'ok' };
}

export function slotLabel(start?: string, end?: string): string | null {
  if (!start) return null;
  const day = new Date(`${start.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${day} ${start.slice(11, 16)}${end ? `–${end.slice(11, 16)}` : ''}`;
}

const GATE_LABEL: Record<string, string> = {
  wind: 'wind above the limit',
  delta_t: 'Delta-T outside the spray band',
  washout: 'rain within 6 h after spraying',
  daylight: 'no daylight hours',
  horizon: 'outside the forecast',
};

export function blockedLabel(reason: string | null): string | null {
  if (!reason) return null;
  if (reason.startsWith('NO_GATE_WINDOW:')) {
    const detail = reason.slice('NO_GATE_WINDOW:'.length);
    const gate = detail.split(':')[0];
    return `No safe window: ${GATE_LABEL[gate] ?? gate} (${detail.slice(gate.length + 1) || 'all hours'})`;
  }
  if (reason.startsWith('NO_CAPACITY:')) return `No free crew or machine: ${reason.slice('NO_CAPACITY:'.length)}`;
  return reason;
}
