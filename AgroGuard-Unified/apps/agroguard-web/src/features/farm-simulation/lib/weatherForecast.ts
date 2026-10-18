/**
 * Open-Meteo forecast adapter.
 *
 * Endpoint and payload shape verified live on 2026-10-05 at lat 16.9825,
 * lon 95.8812: the daily block returns parallel arrays under `daily.time`,
 * `daily.temperature_2m_max`, `daily.temperature_2m_min`,
 * `daily.precipitation_sum` and `daily.wind_speed_10m_max`, with unit labels
 * under `daily_units`.
 *
 * Unit handling matters for the wind guard. Upstream reports wind speed in
 * km/h by default; the 5.5 m/s safety ceiling in docs/agriquill/SECURITY_SAFETY.md
 * is in m/s. Every wind value is converted from the unit the API actually
 * declared, never assumed, and the guard consumes m/s only.
 */

import {
  asArray,
  asFiniteNumber,
  asRecord,
  ContractError,
  fetchJson,
  type FetchOutcome,
  type RetryPolicy
} from './http.ts';

export const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

/** Docs contract a 14-day daily forecast for the territory profile. */
export const FORECAST_DAYS = 14;

export interface DailyForecast {
  readonly date: string;
  readonly tempMinC: number;
  readonly tempMaxC: number;
  readonly precipitationMm: number;
  /** Always metres per second after conversion. */
  readonly windMaxMs: number;
  /** Preserved so the UI can show the upstream value verbatim. */
  readonly windUnitAsReported: string;
}

export interface WeatherForecast {
  readonly latitude: number;
  readonly longitude: number;
  readonly days: readonly DailyForecast[];
  readonly fetchedAt: string;
  readonly fromCache: boolean;
  /** Set when the request carried model labels. */
  readonly model: string | null;
}

/** Wind multipliers from upstream unit to m/s. Verified label is km/h. */
const WIND_TO_MS: Record<string, number> = {
  'km/h': 1 / 3.6,
  'm/s': 1,
  'ms': 1,
  'mph': 0.44704,
  'kn': 0.514444,
  'kt': 0.514444
};

function convertWind(value: number, unit: string, path: string): number {
  const factor = WIND_TO_MS[unit];
  if (!factor) {
    throw new ContractError(`${path}: unmapped upstream wind unit "${unit}"`);
  }
  // Tropical cyclone winds can exceed 120 m/s; cap the plausibility bound high
  // enough that a real storm is not rejected as a contract violation.
  return asFiniteNumber(Math.round(value * factor * 1000) / 1000, `${path} (m/s)`, { min: 0, max: 150 });
}

function seriesNumber(
  daily: Record<string, unknown>,
  key: string,
  index: number,
  bounds: { min: number; max: number }
): number {
  const series = asArray(daily[key], `daily.${key}`);
  if (index >= series.length) {
    throw new ContractError(`daily.${key} has ${series.length} entries, needed index ${index}`);
  }
  // Open-Meteo returns each daily variable as a parallel array of raw numbers,
  // not objects, so read the value directly rather than via an entry.value field.
  return asFiniteNumber(series[index], `daily.${key}[${index}]`, bounds);
}

function parseForecast(raw: unknown, fromCache: boolean): WeatherForecast {
  const root = asRecord(raw, 'root');
  const latitude = asFiniteNumber(root.latitude, 'latitude', { min: -90, max: 90 });
  const longitude = asFiniteNumber(root.longitude, 'longitude', { min: -180, max: 180 });
  const daily = asRecord(root.daily, 'daily');
  const units = asRecord(root.daily_units, 'daily_units');

  const times = asArray(daily.time, 'daily.time');
  if (times.length === 0) throw new ContractError('daily.time is empty');
  if (times.length !== FORECAST_DAYS) {
    throw new ContractError(`expected ${FORECAST_DAYS} forecast days, upstream returned ${times.length}`);
  }

  const windUnitRaw = units.wind_speed_10m_max;
  if (typeof windUnitRaw !== 'string') {
    throw new ContractError('daily_units.wind_speed_10m_max missing; cannot apply the m/s wind guard safely');
  }

  const precipUnitRaw = units.precipitation_sum;
  const precipFactor = precipUnitRaw === 'inch' ? 25.4 : precipUnitRaw === 'mm' ? 1 : undefined;
  if (precipFactor === undefined) {
    throw new ContractError(`unmapped precipitation unit "${String(precipUnitRaw)}"`);
  }

  const days: DailyForecast[] = times.map((entry, index) => {
    if (typeof entry !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry)) {
      throw new ContractError(`daily.time[${index}] is not an ISO date`);
    }
    const rawPrecip = seriesNumber(daily, 'precipitation_sum', index, { min: 0, max: 2000 });
    return {
      date: entry,
      tempMinC: seriesNumber(daily, 'temperature_2m_min', index, { min: -90, max: 60 }),
      tempMaxC: seriesNumber(daily, 'temperature_2m_max', index, { min: -90, max: 65 }),
      precipitationMm: asFiniteNumber(
        Math.round(rawPrecip * precipFactor * 100) / 100,
        `daily.precipitation_sum[${index}] (mm)`,
        { min: 0, max: 2000 }
      ),
      windMaxMs: convertWind(
        seriesNumber(daily, 'wind_speed_10m_max', index, { min: 0, max: 600 }),
        windUnitRaw,
        `daily.wind_speed_10m_max[${index}]`
      ),
      windUnitAsReported: windUnitRaw
    };
  });

  days.forEach((day, index) => {
    if (day.tempMaxC < day.tempMinC) {
      throw new ContractError(`day ${day.date} has max ${day.tempMaxC} below min ${day.tempMinC}`);
    }
  });

  return {
    latitude,
    longitude,
    days,
    fetchedAt: new Date().toISOString(),
    fromCache,
    model: typeof root.model === 'string' ? root.model : null
  };
}

export interface WeatherRequest {
  readonly lat: number;
  readonly lon: number;
  readonly days?: number;
  readonly model?: string;
  readonly signal?: AbortSignal;
  readonly retry?: RetryPolicy;
  readonly cacheTtlMs?: number;
}

export async function fetchWeatherForecast(
  request: WeatherRequest
): Promise<FetchOutcome<WeatherForecast>> {
  const { lat, lon } = request;
  const days = request.days ?? FORECAST_DAYS;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return {
      kind: 'error',
      reason: { type: 'contract', source: 'open-meteo', detail: `latitude ${lat} outside [-90, 90]` }
    };
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return {
      kind: 'error',
      reason: { type: 'contract', source: 'open-meteo', detail: `longitude ${lon} outside [-180, 180]` }
    };
  }
  if (days !== FORECAST_DAYS) {
    return {
      kind: 'error',
      reason: {
        type: 'contract',
        source: 'open-meteo',
        detail: `docs specify ${FORECAST_DAYS} days, requested ${days}`
      }
    };
  }

  const params = new URLSearchParams();
  params.set('latitude', lat.toFixed(6));
  params.set('longitude', lon.toFixed(6));
  params.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max'
  );
  params.set('forecast_days', String(days));
  // Pin the timezone so day boundaries match the parcel, not the server.
  params.set('timezone', 'auto');
  // Wind unit is pinned to km/h because that is the label verified upstream;
  // the adapter converts from whatever daily_units reports regardless.
  params.set('wind_speed_unit', 'kmh');
  if (request.model !== undefined) params.set('models', request.model);

  return fetchJson(`${OPEN_METEO_ENDPOINT}?${params.toString()}`, 'open-meteo', {
    // Forecasts are volatile; keep the cache short.
    cacheTtlMs: request.cacheTtlMs ?? 10 * 60_000,
    signal: request.signal,
    retry: request.retry,
    parse: raw => parseForecast(raw, false)
  });
}