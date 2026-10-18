import type { StorageLike } from '../paddySettings.ts';
import type { ArchivePayload, DailyWeather, ForecastPayload } from './twinTypes.ts';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';
const SOILGRIDS_URL = 'https://rest.isric.org/soilgrids/v2.0/properties/query';
const CURRENT_FIELDS =
  'temperature_2m,relative_humidity_2m,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day';
const DAILY_FIELDS = 'temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration';
const SOIL_MOISTURE_FIELDS = 'soil_moisture_0_to_1cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm';
export const PAST_DAYS = 92;
const RATE_LIMIT_WAIT_MS = 62000;
const SOILGRIDS_GAP_MS = 13000;
const BATCH = 50;

export interface Point {
  id: string;
  lat: number;
  lon: number;
}

export interface JsonResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export interface OpenMeteoDeps {
  fetcher: (url: string) => Promise<JsonResponse>;
  storage: StorageLike | null;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  onWait?: () => void;
}

export interface ForecastResult {
  at: number;
  data: Record<string, ForecastPayload>;
  cached: boolean;
  fetched: number;
}

export interface SoilMoisture {
  top: number | null;
  mid: number | null;
  deep: number | null;
  time: string;
}

export interface SoilMoistureResult {
  sig: string;
  at: number;
  data: Record<string, SoilMoisture>;
}

export interface ArchiveRequest extends Point {
  start: string;
  end: string;
}

export interface ArchiveEntry extends ArchivePayload {
  lat: number;
  lon: number;
  start: string;
  end: string;
}

export interface SoilProfile {
  lat: number;
  lon: number;
  at: number;
  ph: number | null;
  clay: number | null;
  sand: number | null;
  silt: number | null;
  soc: number | null;
  texture: string | null;
  depth: string;
  empty?: boolean;
}

interface ForecastCacheEntry {
  lat: number;
  lon: number;
  at: number;
  d: ForecastPayload;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const asArray = (payload: unknown): unknown[] => (Array.isArray(payload) ? payload : [payload]);
const coords = (pts: readonly Point[]) => `latitude=${pts.map((p) => p.lat).join(',')}&longitude=${pts.map((p) => p.lon).join(',')}`;
const signature = (pts: readonly Point[]) => pts.map((p) => `${p.id}@${p.lat},${p.lon}`).join('|');

export function classifyTexture(sand: number, silt: number, clay: number): string {
  if (silt + 1.5 * clay < 15) return 'Sand';
  if (silt + 2 * clay < 30) return 'Loamy sand';
  if ((clay >= 7 && clay < 20 && sand > 52) || (clay < 7 && silt < 50)) return 'Sandy loam';
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return 'Loam';
  if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12)) return 'Silt loam';
  if (silt >= 80 && clay < 12) return 'Silt';
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return 'Sandy clay loam';
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return 'Clay loam';
  if (clay >= 27 && clay < 40 && sand <= 20) return 'Silty clay loam';
  if (clay >= 35 && sand > 45) return 'Sandy clay';
  if (clay >= 40 && silt >= 40) return 'Silty clay';
  if (clay >= 40) return 'Clay';
  return 'Unclassified';
}

export function createOpenMeteo(deps: OpenMeteoDeps) {
  const read = <T>(key: string): T | null => {
    try {
      const raw = deps.storage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: unknown) => {
    try {
      deps.storage?.setItem(key, JSON.stringify(value));
    } catch {
      return;
    }
  };

  async function getJson(url: string, tries = 2): Promise<unknown> {
    const response = await deps.fetcher(url);
    if (response.status === 429 && tries > 0) {
      deps.onWait?.();
      await deps.sleep(RATE_LIMIT_WAIT_MS);
      return getJson(url, tries - 1);
    }
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (isRecord(body) && typeof body.reason === 'string') message += ` · ${body.reason}`;
      } catch {
        message += '';
      }
      throw new Error(message);
    }
    return response.json();
  }

  let forecastQueue: Promise<unknown> = Promise.resolve();

  async function forecastNow(pts: readonly Point[], maxAgeMin: number, force: boolean): Promise<ForecastResult> {
    const stored = read<Record<string, ForecastCacheEntry>>('aq-om-forecast');
    const cache: Record<string, ForecastCacheEntry> = stored && !('sig' in stored) ? stored : {};
    const now = deps.now();
    const data: Record<string, ForecastPayload> = {};
    const need: Point[] = [];
    let oldest = now;
    pts.forEach((p) => {
      const entry = cache[p.id];
      if (!force && entry && entry.lat === p.lat && entry.lon === p.lon && now - entry.at < maxAgeMin * 60000) {
        data[p.id] = entry.d;
        oldest = Math.min(oldest, entry.at);
      } else need.push(p);
    });
    for (const part of chunk(need, BATCH)) {
      const url = `${FORECAST_URL}?${coords(part)}&current=${CURRENT_FIELDS}&daily=${DAILY_FIELDS}&past_days=${PAST_DAYS}&forecast_days=7&timezone=auto&wind_speed_unit=kmh`;
      const body = await getJson(url);
      const at = deps.now();
      asArray(body).forEach((item, i) => {
        const x = isRecord(item) ? item : {};
        const p = part[i];
        const d: ForecastPayload = {
          current: x.current as ForecastPayload['current'],
          daily: x.daily as DailyWeather,
          elevation: typeof x.elevation === 'number' ? x.elevation : undefined,
          fetchedAt: at,
        };
        data[p.id] = d;
        cache[p.id] = { lat: p.lat, lon: p.lon, at, d };
      });
    }
    if (need.length) write('aq-om-forecast', cache);
    return { at: need.length ? deps.now() : oldest, data, cached: !need.length, fetched: need.length };
  }

  function forecast(pts: readonly Point[], options: { maxAgeMin?: number; force?: boolean } = {}): Promise<ForecastResult> {
    const run = () => forecastNow(pts, options.maxAgeMin ?? 15, options.force ?? false);
    const next = forecastQueue.then(run, run);
    forecastQueue = next;
    return next;
  }

  async function soilMoisture(pts: readonly Point[], maxAgeMin = 60): Promise<SoilMoistureResult> {
    const cached = read<SoilMoistureResult>('aq-om-soilm');
    if (cached && cached.sig === signature(pts) && deps.now() - cached.at < maxAgeMin * 60000) return cached;
    const data: Record<string, SoilMoisture> = {};
    for (const part of chunk(pts, BATCH)) {
      const body = await getJson(`${FORECAST_URL}?${coords(part)}&hourly=${SOIL_MOISTURE_FIELDS}&forecast_days=1&timezone=auto`);
      asArray(body).forEach((item, i) => {
        const x = isRecord(item) ? item : {};
        const hourly = x.hourly as Record<string, (number | null)[] & string[]> | undefined;
        if (!hourly) return;
        const offset = typeof x.utc_offset_seconds === 'number' ? x.utc_offset_seconds : 0;
        const local = `${new Date(deps.now() + offset * 1000).toISOString().slice(0, 13)}:00`;
        const k = Math.max(0, hourly.time.indexOf(local));
        data[part[i].id] = {
          top: hourly.soil_moisture_0_to_1cm[k],
          mid: hourly.soil_moisture_3_to_9cm[k],
          deep: hourly.soil_moisture_9_to_27cm[k],
          time: hourly.time[k],
        };
      });
    }
    const out: SoilMoistureResult = { sig: signature(pts), at: deps.now(), data };
    write('aq-om-soilm', out);
    return out;
  }

  async function archive(requests: readonly ArchiveRequest[]): Promise<Record<string, ArchiveEntry>> {
    const cache = read<Record<string, ArchiveEntry>>('aq-om-archive') ?? {};
    const out: Record<string, ArchiveEntry> = {};
    const need: ArchiveRequest[] = [];
    requests.forEach((q) => {
      const c = cache[q.id];
      if (c && c.start <= q.start && c.end >= q.end && c.lat === q.lat && c.lon === q.lon) out[q.id] = c;
      else need.push(q);
    });
    if (need.length) {
      const start = need.reduce((a, q) => (q.start < a ? q.start : a), need[0].start);
      const end = need[0].end;
      for (const part of chunk(need, BATCH)) {
        const body = await getJson(`${ARCHIVE_URL}?${coords(part)}&start_date=${start}&end_date=${end}&daily=${DAILY_FIELDS}&timezone=auto`);
        asArray(body).forEach((item, i) => {
          const q = part[i];
          const x = isRecord(item) ? item : {};
          const entry: ArchiveEntry = { lat: q.lat, lon: q.lon, start, end, daily: x.daily as DailyWeather };
          cache[q.id] = entry;
          out[q.id] = entry;
        });
      }
      write('aq-om-archive', cache);
    }
    return out;
  }

  async function elevation(pts: readonly Point[]): Promise<Record<string, number>> {
    const cache = read<Record<string, { lat: number; lon: number; m: number }>>('aq-om-elev') ?? {};
    const need = pts.filter((p) => !(cache[p.id] && cache[p.id].lat === p.lat && cache[p.id].lon === p.lon));
    for (const part of chunk(need, 100)) {
      const body = await getJson(`${ELEVATION_URL}?${coords(part)}`);
      const values = isRecord(body) && Array.isArray(body.elevation) ? (body.elevation as number[]) : [];
      part.forEach((p, i) => {
        cache[p.id] = { lat: p.lat, lon: p.lon, m: values[i] };
      });
    }
    if (need.length) write('aq-om-elev', cache);
    const out: Record<string, number> = {};
    pts.forEach((p) => {
      if (cache[p.id]) out[p.id] = cache[p.id].m;
    });
    return out;
  }

  interface SoilJob {
    p: Point;
    resolve: (value: SoilProfile) => void;
    reject: (reason: unknown) => void;
  }
  const soilQueue: SoilJob[] = [];
  let soilBusy = false;
  let soilLast = 0;

  async function pump(): Promise<void> {
    if (soilBusy || !soilQueue.length) return;
    soilBusy = true;
    const job = soilQueue.shift();
    if (!job) return;
    await deps.sleep(Math.max(0, soilLast + SOILGRIDS_GAP_MS - deps.now()));
    try {
      soilLast = deps.now();
      const url = `${SOILGRIDS_URL}?lon=${job.p.lon}&lat=${job.p.lat}&property=phh2o&property=clay&property=sand&property=silt&property=soc&depth=0-5cm&depth=5-15cm&value=mean`;
      const body = await getJson(url);
      const layers: Record<string, (number | null)[]> = {};
      const props = isRecord(body) && isRecord(body.properties) && Array.isArray(body.properties.layers) ? body.properties.layers : [];
      props.forEach((layer: unknown) => {
        if (!isRecord(layer) || typeof layer.name !== 'string' || !Array.isArray(layer.depths)) return;
        const unit = isRecord(layer.unit_measure) && typeof layer.unit_measure.d_factor === 'number' ? layer.unit_measure.d_factor : 1;
        layers[layer.name] = layer.depths.map((depth: unknown) => {
          const mean = isRecord(depth) && isRecord(depth.values) && typeof depth.values.mean === 'number' ? depth.values.mean : null;
          return mean == null ? null : mean / unit;
        });
      });
      const avg = (key: string): number | null => {
        const values = (layers[key] ?? []).filter((v): v is number => v != null);
        return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      };
      const sand = avg('sand');
      const silt = avg('silt');
      const clay = avg('clay');
      const profile: SoilProfile = {
        lat: job.p.lat,
        lon: job.p.lon,
        at: deps.now(),
        ph: avg('phh2o'),
        clay,
        sand,
        silt,
        soc: avg('soc'),
        texture: sand != null && silt != null && clay != null ? classifyTexture(sand, silt, clay) : null,
        depth: '0–15 cm',
      };
      if (profile.ph == null && profile.clay == null) profile.empty = true;
      const cache = read<Record<string, SoilProfile>>('aq-soilgrids') ?? {};
      cache[job.p.id] = profile;
      write('aq-soilgrids', cache);
      job.resolve(profile);
    } catch (error) {
      job.reject(error);
    }
    soilBusy = false;
    void pump();
  }

  function soilgrids(p: Point): Promise<SoilProfile> {
    const cache = read<Record<string, SoilProfile>>('aq-soilgrids') ?? {};
    const cached = cache[p.id];
    if (cached && cached.lat === p.lat && cached.lon === p.lon) return Promise.resolve(cached);
    return new Promise<SoilProfile>((resolve, reject) => {
      soilQueue.push({ p, resolve, reject });
      void pump();
    });
  }

  return { forecast, soilMoisture, archive, elevation, soilgrids };
}

export type OpenMeteo = ReturnType<typeof createOpenMeteo>;
