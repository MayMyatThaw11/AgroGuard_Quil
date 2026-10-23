import type { StorageLike } from '../paddySettings.ts';
import { overpassQuery, parseOverpass, slopeFromSamples, type SiteSnapshot } from '../livetwin/twinGis.ts';
import type { JsonResponse } from '../livetwin/twinOpenMeteo.ts';
import { classifyFetchFailure, HttpStatusError } from '../fetchFailure.ts';

export type SourceClass = 'MEASURED' | 'LAB_TESTED' | 'FARMER_REPORTED' | 'REMOTELY_ESTIMATED' | 'MODELLED' | 'FORECAST' | 'DOCUMENTED_REFERENCE' | 'DEMO_FIXTURE' | 'UNKNOWN';

export type FactId =
  | 'rainMm' | 'et0Mm' | 'aridity' | 'meanTempC' | 'coldestMonthC' | 'warmestMonthC' | 'dryMonths' | 'radiation'
  | 'elevationM' | 'slopePct' | 'finePct'
  | 'coastKm' | 'waterKm' | 'riverKm' | 'forestKm' | 'townKm' | 'protectedKm';

export type ServerFactId = 'volcanoKm' | 'heatDays';

export interface Spread {
  min: number;
  max: number;
  n: number;
}

export interface Datum {
  id: FactId | ServerFactId;
  label: string;
  value: number | null;
  unit: string;
  sourceClass: SourceClass;
  provider: string;
  method: string;
  period?: string;
  resolution?: string;
  retrievedAt?: number;
  beyondKm?: number;
  reason?: string;
  spread?: Spread;
  source?: { provider: string; url: string; retrieved_at: string; sha256: string } | null;
}

export interface SiteFacts {
  lat: number;
  lon: number;
  facts: Record<FactId, Datum> & Partial<Record<ServerFactId, Datum>>;
  pinIn: string[];
  retrievedAt: number;
}

export interface DailyClimate {
  time: string[];
  precipitation_sum: (number | null)[];
  temperature_2m_mean: (number | null)[];
  et0_fao_evapotranspiration: (number | null)[];
  shortwave_radiation_sum: (number | null)[];
}

const ERA5 = 'Open-Meteo historical archive (ECMWF ERA5 reanalysis)';
const DEM = 'Open-Meteo elevation API (Copernicus DEM GLO-90)';
const OSM = 'OpenStreetMap contributors via Overpass (ODbL)';
const SOILGRIDS = 'ISRIC SoilGrids 2.0 (CC BY 4.0)';
const DRY_MONTH_MM = 60;
const MAX_MISSING_SHARE = 0.1;
const NEAR_RADIUS_KM = 4;
const TOWN_RADIUS_KM = 15;
const PROTECTED_RADIUS_KM = 10;
export const CLIMATE_YEARS = 10;

const missing = (id: FactId, label: string, unit: string, provider: string, reason: string, sourceClass: SourceClass = 'UNKNOWN'): Datum => ({
  id, label, value: null, unit, sourceClass, provider, method: '—', reason,
});

export function climateFacts(daily: DailyClimate | null, period: string, retrievedAt: number, failure?: string): Pick<Record<FactId, Datum>, 'rainMm' | 'et0Mm' | 'aridity' | 'meanTempC' | 'coldestMonthC' | 'warmestMonthC' | 'dryMonths' | 'radiation'> {
  const fail = (reason: string) => ({
    rainMm: missing('rainMm', 'Annual rain', 'mm', ERA5, reason),
    et0Mm: missing('et0Mm', 'Annual reference ET (FAO-56)', 'mm', ERA5, reason),
    aridity: missing('aridity', 'Aridity index (rain ÷ ET₀)', '', ERA5, reason),
    meanTempC: missing('meanTempC', 'Mean temperature', '°C', ERA5, reason),
    coldestMonthC: missing('coldestMonthC', 'Coldest month mean', '°C', ERA5, reason),
    warmestMonthC: missing('warmestMonthC', 'Warmest month mean', '°C', ERA5, reason),
    dryMonths: missing('dryMonths', `Months under ${DRY_MONTH_MM} mm`, 'months', ERA5, reason),
    radiation: missing('radiation', 'Mean daily solar radiation', 'MJ/m²/day', ERA5, reason),
  });
  if (!daily || !daily.time?.length) return fail(failure ?? 'Climate archive not loaded');
  const n = daily.time.length;
  const gaps = daily.precipitation_sum.filter((v) => v == null).length + daily.temperature_2m_mean.filter((v) => v == null).length;
  if (gaps / (2 * n) > MAX_MISSING_SHARE) return fail(`${Math.round((gaps / (2 * n)) * 100)}% of archive days are missing`);
  const years = new Set(daily.time.map((t) => t.slice(0, 4))).size;
  const byMonth = Array.from({ length: 12 }, () => ({ rain: 0, et0: 0, temp: 0, tempN: 0 }));
  let tempSum = 0;
  let tempN = 0;
  let radSum = 0;
  let radN = 0;
  daily.time.forEach((t, i) => {
    const m = Number(t.slice(5, 7)) - 1;
    const p = daily.precipitation_sum[i];
    const e = daily.et0_fao_evapotranspiration[i];
    const tm = daily.temperature_2m_mean[i];
    const r = daily.shortwave_radiation_sum[i];
    if (p != null) byMonth[m].rain += p;
    if (e != null) byMonth[m].et0 += e;
    if (tm != null) {
      byMonth[m].temp += tm;
      byMonth[m].tempN += 1;
      tempSum += tm;
      tempN += 1;
    }
    if (r != null) {
      radSum += r;
      radN += 1;
    }
  });
  const monthRain = byMonth.map((x) => x.rain / years);
  const monthTemp = byMonth.map((x) => (x.tempN ? x.temp / x.tempN : Number.NaN));
  const rain = monthRain.reduce((a, b) => a + b, 0);
  const et0 = byMonth.reduce((a, x) => a + x.et0 / years, 0);
  const derived = (id: FactId, label: string, value: number, unit: string, method: string): Datum => ({
    id, label, value, unit, sourceClass: 'MODELLED', provider: ERA5, method, period, resolution: '~25 km grid (ERA5 via Open-Meteo)', retrievedAt,
  });
  return {
    rainMm: derived('rainMm', 'Annual rain', Math.round(rain), 'mm', `Mean annual total over ${years} years`),
    et0Mm: derived('et0Mm', 'Annual reference ET (FAO-56)', Math.round(et0), 'mm', `FAO-56 Penman–Monteith ET₀ as served by Open-Meteo, mean annual total over ${years} years`),
    aridity: derived('aridity', 'Aridity index (rain ÷ ET₀)', +(et0 > 0 ? rain / et0 : 0).toFixed(2), '', 'Annual rain divided by annual ET₀ (UNEP aridity index form)'),
    meanTempC: derived('meanTempC', 'Mean temperature', +(tempSum / Math.max(1, tempN)).toFixed(1), '°C', 'Mean of daily 2 m mean temperature'),
    coldestMonthC: derived('coldestMonthC', 'Coldest month mean', +Math.min(...monthTemp).toFixed(1), '°C', 'Lowest of 12 monthly mean temperatures'),
    warmestMonthC: derived('warmestMonthC', 'Warmest month mean', +Math.max(...monthTemp).toFixed(1), '°C', 'Highest of 12 monthly mean temperatures'),
    dryMonths: derived('dryMonths', `Months under ${DRY_MONTH_MM} mm`, monthRain.filter((v) => v < DRY_MONTH_MM).length, 'months', `Calendar months whose mean rain is under ${DRY_MONTH_MM} mm (Köppen dry-month line)`),
    radiation: derived('radiation', 'Mean daily solar radiation', +(radSum / Math.max(1, radN)).toFixed(1), 'MJ/m²/day', 'Mean of daily shortwave radiation sums'),
  };
}

export function terrainFacts(lat: number, lon: number, elevations: readonly number[] | null, retrievedAt: number, failure?: string): Pick<Record<FactId, Datum>, 'elevationM' | 'slopePct'> {
  if (!elevations || elevations.length < 5 || elevations.some((e) => !Number.isFinite(e))) {
    const reason = failure ?? 'Elevation samples not loaded';
    return { elevationM: missing('elevationM', 'Elevation', 'm', DEM, reason), slopePct: missing('slopePct', 'Slope over 300 m', '%', DEM, reason) };
  }
  const sample = slopeFromSamples({ id: 'site', lat, lon }, elevations, retrievedAt);
  return {
    elevationM: { id: 'elevationM', label: 'Elevation', value: Math.round(sample.elev), unit: 'm', sourceClass: 'REMOTELY_ESTIMATED', provider: DEM, method: 'DEM value at the point', resolution: '90 m', retrievedAt },
    slopePct: { id: 'slopePct', label: 'Slope over 300 m', value: sample.slopePct, unit: '%', sourceClass: 'MODELLED', provider: DEM, method: 'Central difference between DEM points 300 m north, south, east and west', resolution: '90 m DEM, 600 m baseline', retrievedAt },
  };
}

interface SoilDepth {
  range?: { top_depth: number; bottom_depth: number };
  values?: { mean: number | null };
}

export interface SoilGridsResponse {
  properties?: { layers?: { name: string; unit_measure?: { d_factor?: number }; depths?: SoilDepth[] }[] };
}

function topsoilPct(raw: SoilGridsResponse, name: string): number | null {
  const layer = raw.properties?.layers?.find((l) => l.name === name);
  const factor = layer?.unit_measure?.d_factor;
  const depths = layer?.depths ?? [];
  if (!factor || !depths.length) return null;
  let sum = 0;
  let cm = 0;
  for (const d of depths) {
    const mean = d.values?.mean;
    if (mean == null || !d.range) return null;
    const thick = d.range.bottom_depth - d.range.top_depth;
    sum += (mean / factor) * thick;
    cm += thick;
  }
  return cm > 0 ? sum / cm : null;
}

export function soilFacts(raw: SoilGridsResponse | null, retrievedAt: number, failure?: string): Pick<Record<FactId, Datum>, 'finePct'> {
  const label = 'Topsoil silt + clay (0–30 cm)';
  if (!raw) return { finePct: missing('finePct', label, '%', SOILGRIDS, failure ?? 'Soil map not loaded') };
  const clay = topsoilPct(raw, 'clay');
  const silt = topsoilPct(raw, 'silt');
  if (clay == null || silt == null) return { finePct: missing('finePct', label, '%', SOILGRIDS, 'SoilGrids has no value here (water, built-up land or no data)') };
  return {
    finePct: { id: 'finePct', label, value: Math.round(clay + silt), unit: '%', sourceClass: 'MODELLED', provider: SOILGRIDS, method: 'Silt plus clay, thickness-weighted mean of the 0–5, 5–15 and 15–30 cm predictions', resolution: '250 m', retrievedAt },
  };
}

export function surroundingFacts(snapshot: SiteSnapshot | null, retrievedAt: number, failure?: string): Pick<Record<FactId, Datum>, 'coastKm' | 'waterKm' | 'riverKm' | 'forestKm' | 'townKm' | 'protectedKm'> {
  const reason = failure ?? 'OpenStreetMap surroundings not loaded';
  const near = snapshot?.near ?? {};
  const fact = (id: FactId, label: string, keys: readonly string[], radius: number): Datum => {
    if (!snapshot) return missing(id, label, 'km', OSM, reason);
    const hits = keys.map((k) => near[k]?.d).filter((d): d is number => d !== undefined);
    const base = { id, label, unit: 'km', sourceClass: 'REMOTELY_ESTIMATED' as const, provider: OSM, method: 'Distance to the nearest mapped feature centre', retrievedAt };
    if (!hits.length) return { ...base, value: null, beyondKm: radius, reason: `None mapped within ${radius} km` };
    return { ...base, value: +(Math.min(...hits) / 1000).toFixed(1) };
  };
  return {
    coastKm: fact('coastKm', 'Coast', ['coast'], NEAR_RADIUS_KM),
    waterKm: fact('waterKm', 'Surface water (river, canal, lake)', ['river', 'canal', 'stream', 'water'], NEAR_RADIUS_KM),
    riverKm: fact('riverKm', 'River', ['river'], NEAR_RADIUS_KM),
    forestKm: fact('forestKm', 'Forest', ['forest'], NEAR_RADIUS_KM),
    townKm: fact('townKm', 'Town or city (market)', ['town'], TOWN_RADIUS_KM),
    protectedKm: fact('protectedKm', 'Protected area', ['protected'], PROTECTED_RADIUS_KM),
  };
}

export interface SiteDeps {
  fetcher: (url: string, init?: { method: string; body: string; headers: Record<string, string> }) => Promise<JsonResponse>;
  storage: StorageLike | null;
  now: () => number;
  siteContext?: (farmId: string) => Promise<JsonResponse>;
}

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const ELEVATION = 'https://api.open-meteo.com/v1/elevation';
const OVERPASS: readonly string[] = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const SOIL = 'https://rest.isric.org/soilgrids/v2.0/properties/query';
const CACHE_KEY = 'aq-site-facts-v2';
const CACHE_TTL_MS = 30 * 86400000;
const RAD = Math.PI / 180;
const STEP_M = 300;

export function climatePeriod(now: number): { start: string; end: string; label: string } {
  const year = new Date(now).getUTCFullYear() - 1;
  const first = year - CLIMATE_YEARS + 1;
  return { start: `${first}-01-01`, end: `${year}-12-31`, label: `${first}–${year}` };
}

export function createSiteService(deps: SiteDeps) {
  const read = (): Record<string, SiteFacts> => {
    try {
      const raw = deps.storage?.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, SiteFacts>) : {};
    } catch {
      return {};
    }
  };
  const write = (value: Record<string, SiteFacts>) => {
    try {
      deps.storage?.setItem(CACHE_KEY, JSON.stringify(value));
    } catch {
      return;
    }
  };
  const json = async (url: string, init?: { method: string; body: string; headers: Record<string, string> }) => {
    const res = await deps.fetcher(url, init);
    if (!res.ok) {
      let reason = '';
      try {
        const body = (await res.json()) as { reason?: string };
        reason = body.reason ? ` · ${body.reason}` : '';
      } catch {
        reason = '';
      }
      throw new HttpStatusError(res.status, `HTTP ${res.status}${reason}`);
    }
    return res.json();
  };
  const message = (e: unknown) => classifyFetchFailure(e).detail;
  const pending = new Map<string, Promise<SiteFacts>>();

  function facts(lat: number, lon: number, farmId?: string): Promise<SiteFacts> {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const ask = farmId && deps.siteContext ? deps.siteContext : null;
    const slot = ask ? `farm:${farmId}` : key;
    const running = pending.get(slot);
    if (running) return running;
    const local = () => {
      const cached = read()[key];
      return cached && deps.now() - cached.retrievedAt < CACHE_TTL_MS ? Promise.resolve(cached) : load(lat, lon, key);
    };
    const job = (ask && farmId ? fromServer(ask, farmId).catch(local) : local()).finally(() => pending.delete(slot));
    pending.set(slot, job);
    return job;
  }

  async function fromServer(ask: (farmId: string) => Promise<JsonResponse>, farmId: string): Promise<SiteFacts> {
    const res = await ask(farmId);
    if (!res.ok) throw new HttpStatusError(res.status, `HTTP ${res.status}`);
    const body = (await res.json()) as Partial<SiteFacts>;
    if (typeof body.lat !== 'number' || typeof body.lon !== 'number' || !body.facts?.rainMm || !Array.isArray(body.pinIn)) {
      throw new Error('site context response has an unexpected shape');
    }
    return body as SiteFacts;
  }

  async function load(lat: number, lon: number, key: string): Promise<SiteFacts> {
    const at = deps.now();
    const period = climatePeriod(at);
    const dLat = STEP_M / 111320;
    const dLon = STEP_M / (111320 * Math.cos(lat * RAD));
    const pts = [[lat, lon], [lat + dLat, lon], [lat - dLat, lon], [lat, lon + dLon], [lat, lon - dLon]];
    const [climate, terrain, around, soil] = await Promise.allSettled([
      json(`${ARCHIVE}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start_date=${period.start}&end_date=${period.end}&daily=precipitation_sum,temperature_2m_mean,et0_fao_evapotranspiration,shortwave_radiation_sum&timezone=auto`),
      json(`${ELEVATION}?latitude=${pts.map((p) => p[0].toFixed(5)).join(',')}&longitude=${pts.map((p) => p[1].toFixed(5)).join(',')}`),
      (async () => {
        const body = `data=${encodeURIComponent(overpassQuery({ id: 'site', lat, lon }))}`;
        let last: unknown = null;
        for (const endpoint of OVERPASS) {
          try {
            return await json(endpoint, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
          } catch (error) {
            last = error;
          }
        }
        throw last ?? new Error('Overpass unavailable');
      })(),
      json(`${SOIL}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&property=clay&property=silt&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean`),
    ]);
    const daily = climate.status === 'fulfilled' ? ((climate.value as { daily?: DailyClimate }).daily ?? null) : null;
    const elevations = terrain.status === 'fulfilled' ? ((terrain.value as { elevation?: number[] }).elevation ?? null) : null;
    const snapshot = around.status === 'fulfilled' ? parseOverpass({ id: 'site', lat, lon }, around.value, at) : null;
    const result: SiteFacts = {
      lat,
      lon,
      retrievedAt: at,
      pinIn: snapshot ? snapshot.inside.map((x) => x.cat) : [],
      facts: {
        ...climateFacts(daily, period.label, at, climate.status === 'rejected' ? `Climate archive unavailable (${message(climate.reason)})` : undefined),
        ...terrainFacts(lat, lon, elevations, at, terrain.status === 'rejected' ? `Elevation unavailable (${message(terrain.reason)})` : undefined),
        ...surroundingFacts(snapshot, at, around.status === 'rejected' ? `OpenStreetMap unavailable (${message(around.reason)})` : undefined),
        ...soilFacts(soil.status === 'fulfilled' ? (soil.value as SoilGridsResponse) : null, at, soil.status === 'rejected' ? `SoilGrids unavailable (${message(soil.reason)})` : undefined),
      },
    };
    if ([climate, terrain, around, soil].every((r) => r.status === 'fulfilled')) write({ ...read(), [key]: result });
    return result;
  }

  return { facts };
}

export type SiteService = ReturnType<typeof createSiteService>;
