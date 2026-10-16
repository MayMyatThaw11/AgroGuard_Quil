import type { OpsFarm, OpsHistory, OpsWeatherDay } from '../data/ops/types.ts';
import type { OpsPlanRequest } from './api.ts';

export interface OpsPlanInput {
  farm: OpsFarm;
  start: Date;
  history: OpsHistory;
  forecastWeather: readonly OpsWeatherDay[];
  overrides: Readonly<Record<string, number | undefined>>;
}

function toWire(day: OpsWeatherDay) {
  return { rain_mm: day.rainMm, temp_c: day.tempC, rh_pct: day.rhPct, wind_ms: day.windMs };
}

function definedOverrides(overrides: OpsPlanInput['overrides']): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'number') out[key] = value;
  }
  return out;
}

export function buildOpsPlanRequest({ farm, start, history, forecastWeather, overrides }: OpsPlanInput): OpsPlanRequest {
  const request: OpsPlanRequest = {
    farm_id: farm.id,
    country: farm.country,
    standard: farm.standard,
    start_date: start.toISOString().slice(0, 10),
    paddies: farm.paddies.map((p) => ({
      id: p.id,
      crop_id: p.cropId,
      stage: p.stage,
      days_since_planting: p.daysSincePlanting,
      area_ha: p.areaHa,
      water_depth_cm: history.depthCm[p.id],
      ndvi: history.ndvi[p.id],
    })),
    weather_history: history.weather.map(toWire),
    weather_forecast: forecastWeather.map(toWire),
    assets: farm.assets.map((a) => ({
      id: a.id,
      kind: a.kind,
      label: a.label,
      status: a.status.toLowerCase(),
      serves: a.serves,
    })),
  };
  const cleaned = definedOverrides(overrides);
  if (Object.keys(cleaned).length > 0) request.threshold_overrides = cleaned;
  if (farm.lat !== undefined && farm.lon !== undefined) {
    request.lat = farm.lat;
    request.lon = farm.lon;
  }
  return request;
}
