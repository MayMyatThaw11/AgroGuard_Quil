import type { StorageLike } from '../paddySettings.ts';
import type { JsonResponse } from './twinOpenMeteo.ts';
import type { ForecastPayload } from './twinTypes.ts';
import { classifyFetchFailure, HttpStatusError } from '../fetchFailure.ts';

const DAY = 86400000;
const EARTH_M = 6371000;
const RAD = Math.PI / 180;
const SLOPE_STEP_M = 300;
const SLOPE_BATCH = 20;
const OVERPASS_GAP_MS = 3500;
const OVERPASS_TIMEOUT_MS = 20000;
const OVERPASS_ENDPOINTS: readonly string[] = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const SITE_TTL_MS = 30 * DAY;

export interface GeoFarm {
  id: string;
  lat: number;
  lon: number;
}

export interface SlopeSample {
  lat: number;
  lon: number;
  elev: number;
  slopePct: number;
  relief: number;
  at: number;
}

export interface NearFeature {
  label: string;
  n: number;
  d: number;
  name: string | null;
  ele: number | null;
}

export interface InsideFeature {
  cat: string;
  label: string;
  name: string | null;
}

export interface SiteSnapshot {
  lat: number;
  lon: number;
  at: number;
  inside: InsideFeature[];
  near: Record<string, NearFeature>;
  source: string;
}

export interface SoilLike {
  clay: number | null;
  sand: number | null;
  soc: number | null;
  empty?: boolean;
}

export type FlagLevel = 'warn' | 'info';

export interface SiteFlag {
  level: FlagLevel;
  msg: string;
}

export interface SiteAnalysis {
  s: SiteSnapshot | null;
  sl: SlopeSample | null;
  soil: SoilLike | null;
  elev: number | null;
  slope: number | null;
  waterM: number | null;
  rain90: number | null;
  flood: 'high' | 'moderate' | 'low' | null;
  saline: 'possible' | 'low' | null;
  protectedNear: boolean;
  pinIn: string[];
  flags: SiteFlag[];
}

export interface AnalyseInput {
  site: SiteSnapshot | null;
  slope: SlopeSample | null;
  soil: SoilLike | null;
  elevation: number | null;
  forecast: ForecastPayload | null;
  today: string | null;
}

type Tags = Record<string, string | undefined>;

const CATEGORIES: readonly (readonly [key: string, label: string, test: (t: Tags) => boolean])[] = [
  ['river', 'River', (t) => t.waterway === 'river'],
  ['canal', 'Canal / ditch', (t) => t.waterway === 'canal' || t.waterway === 'ditch' || t.waterway === 'drain'],
  ['stream', 'Stream', (t) => t.waterway === 'stream'],
  ['waterfall', 'Waterfall', (t) => t.waterway === 'waterfall' || t.natural === 'waterfall'],
  ['water', 'Lake / pond / reservoir', (t) => t.natural === 'water' || t.landuse === 'reservoir' || t.landuse === 'basin'],
  ['wetland', 'Wetland / mangrove', (t) => t.natural === 'wetland'],
  ['coast', 'Beach / coast', (t) => t.natural === 'beach' || t.natural === 'coastline'],
  ['forest', 'Forest / woodland', (t) => t.natural === 'wood' || t.landuse === 'forest'],
  ['peak', 'Hill / peak', (t) => t.natural === 'peak'],
  ['farmland', 'Mapped farmland', (t) => t.landuse === 'farmland' || t.landuse === 'paddy' || t.crop === 'rice'],
  ['aquaculture', 'Aquaculture ponds', (t) => t.landuse === 'aquaculture'],
  ['orchard', 'Orchard / plantation', (t) => t.landuse === 'orchard' || t.landuse === 'plantation'],
  ['village', 'Village', (t) => t.place === 'village' || t.place === 'hamlet'],
  ['town', 'Town / city (market)', (t) => t.place === 'town' || t.place === 'city'],
  ['residential', 'Built-up area', (t) => t.landuse === 'residential'],
  ['protected', 'Protected area', (t) => t.boundary === 'protected_area' || t.leisure === 'nature_reserve' || t.boundary === 'national_park'],
];

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

const sameSpot = (c: { lat: number; lon: number } | null | undefined, f: GeoFarm): boolean =>
  Boolean(c) && Math.abs((c as GeoFarm).lat - f.lat) < 1e-5 && Math.abs((c as GeoFarm).lon - f.lon) < 1e-5;

export function slopeFromSamples(f: GeoFarm, elevations: readonly number[], at: number): SlopeSample {
  const [c, n, s, e, w] = elevations;
  const gx = (e - w) / (2 * SLOPE_STEP_M);
  const gy = (n - s) / (2 * SLOPE_STEP_M);
  return {
    lat: f.lat,
    lon: f.lon,
    elev: c,
    slopePct: +(Math.hypot(gx, gy) * 100).toFixed(1),
    relief: Math.round(Math.max(c, n, s, e, w) - Math.min(c, n, s, e, w)),
    at,
  };
}

export function parseOverpass(farm: GeoFarm, body: unknown, at: number): SiteSnapshot {
  const inside: InsideFeature[] = [];
  const near: Record<string, NearFeature> = {};
  const elements = typeof body === 'object' && body !== null && Array.isArray((body as { elements?: unknown }).elements) ? ((body as { elements: unknown[] }).elements) : [];
  elements.forEach((raw) => {
    if (typeof raw !== 'object' || raw === null) return;
    const e = raw as { type?: string; tags?: Tags; lat?: number; lon?: number; center?: { lat: number; lon: number } };
    const tags = e.tags ?? {};
    if (e.type === 'area') {
      const hit = CATEGORIES.find(([, , test]) => test(tags));
      if (hit) inside.push({ cat: hit[0], label: hit[1], name: tags.name ?? null });
      return;
    }
    const at2 = e.type === 'node' && typeof e.lat === 'number' && typeof e.lon === 'number' ? { lat: e.lat, lon: e.lon } : e.center ? { lat: e.center.lat, lon: e.center.lon } : null;
    if (!at2) return;
    CATEGORIES.forEach(([key, label, test]) => {
      if (!test(tags)) return;
      const d = distanceM(farm, at2);
      const cur = near[key];
      if (!cur) near[key] = { label, n: 1, d, name: tags.name ?? null, ele: tags.ele ? parseFloat(tags.ele) : null };
      else {
        cur.n += 1;
        if (d < cur.d) {
          cur.d = d;
          cur.name = tags.name ?? cur.name;
          if (tags.ele) cur.ele = parseFloat(tags.ele);
        }
      }
    });
  });
  return { lat: farm.lat, lon: farm.lon, at, inside, near, source: 'OpenStreetMap contributors (ODbL) via Overpass' };
}

export function overpassQuery(farm: GeoFarm): string {
  const p = `${farm.lat.toFixed(5)},${farm.lon.toFixed(5)}`;
  return (
    `[out:json][timeout:30];is_in(${p})->.a;(area.a["landuse"];area.a["natural"];area.a["boundary"="protected_area"];area.a["leisure"="nature_reserve"];)->.in;.in out tags;(` +
    `nwr(around:4000,${p})["waterway"~"^(river|canal|ditch|drain|stream|waterfall)$"];nwr(around:4000,${p})["natural"~"^(water|wood|wetland|beach|coastline|peak|waterfall)$"];` +
    `nwr(around:4000,${p})["landuse"~"^(farmland|paddy|forest|residential|aquaculture|orchard|plantation|reservoir|basin)$"];nwr(around:4000,${p})["place"~"^(village|hamlet)$"];` +
    `nwr(around:15000,${p})["place"~"^(town|city)$"];nwr(around:10000,${p})["boundary"~"^(protected_area|national_park)$"];nwr(around:10000,${p})["leisure"="nature_reserve"];);out tags center qt 900;`
  );
}

export function analyseSite(input: AnalyseInput): SiteAnalysis {
  const { site: s, slope: sl, soil, forecast: fc } = input;
  const elev = sl ? sl.elev : input.elevation;
  const slope = sl ? sl.slopePct : null;
  const N = s?.near ?? {};
  const dn = (k: string): number | null => (N[k] ? N[k].d : null);
  const nearest = Math.min(...['river', 'canal', 'stream', 'water'].map((k) => (N[k] ? N[k].d : 1e9)));
  const waterM = nearest < 1e9 ? nearest : null;
  let rain90: number | null = null;
  if (fc?.daily && input.today) {
    const i0 = fc.daily.time.indexOf(input.today);
    if (i0 > 0) rain90 = fc.daily.precipitation_sum.slice(Math.max(0, i0 - 90), i0).reduce<number>((a, b) => a + (b ?? 0), 0);
  }
  const river = dn('river');
  const coast = dn('coast');
  const flood = elev == null || !s ? null : elev < 8 && river != null && river < 3000 ? 'high' : elev < 15 && (river != null || dn('wetland') != null) ? 'moderate' : 'low';
  const saline = elev == null || !s ? null : elev < 6 && ((coast != null && coast < 15000) || N.aquaculture) ? 'possible' : 'low';
  const prot = dn('protected');
  const protectedNear = prot != null && prot < 3000;
  const pinIn = s ? s.inside.map((x) => x.cat) : [];
  const flags: SiteFlag[] = [];
  if (pinIn.includes('residential')) flags.push({ level: 'warn', msg: 'The farm pin lies inside a mapped built-up area. Check the coordinates against the field boundary.' });
  if (pinIn.includes('water')) flags.push({ level: 'warn', msg: 'The farm pin lies inside mapped open water. Check the coordinates.' });
  if (protectedNear && prot != null) {
    flags.push({ level: 'warn', msg: `Protected area ${(prot / 1000).toFixed(1)} km away${N.protected?.name ? ` (${N.protected.name})` : ''}: keep fish- and bee-toxic products out of the buffer.` });
  }
  if (saline === 'possible' && elev != null) flags.push({ level: 'info', msg: `Low-lying coastal delta (${Math.round(elev)} m): dry-season salinity intrusion is possible; time intake to river salinity.` });
  if (flood === 'high' && river != null) flags.push({ level: 'info', msg: `Low elevation and a river within ${(river / 1000).toFixed(1)} km: flood-prone; keep bunds and fish screens high.` });
  return { s, sl, soil, elev, slope, waterM, rain90, flood, saline, protectedNear, pinIn, flags };
}

export interface GisDeps {
  fetcher: (url: string, init?: { method: string; body: string; headers: Record<string, string>; signal?: AbortSignal }) => Promise<JsonResponse>;
  storage: StorageLike | null;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export type GisStatus = 'queued' | 'loading' | 'ok' | 'error';

export function createGis(deps: GisDeps) {
  const read = <T>(key: string, fallback: T): T => {
    try {
      const raw = deps.storage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key: string, value: unknown) => {
    try {
      deps.storage?.setItem(key, JSON.stringify(value));
    } catch {
      return;
    }
  };
  const SITE = read<Record<string, SiteSnapshot>>('aq-gis-site', {});
  const SLOPE = read<Record<string, SlopeSample>>('aq-gis-slope', {});
  const status: Record<string, string> = {};
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());

  async function slopes(farms: readonly GeoFarm[]): Promise<string[]> {
    const need = farms.filter((f) => !sameSpot(SLOPE[f.id], f));
    const failed: string[] = [];
    for (let i = 0; i < need.length; i += SLOPE_BATCH) {
      const part = need.slice(i, i + SLOPE_BATCH);
      const pts: [number, number][] = [];
      part.forEach((f) => {
        const dLat = SLOPE_STEP_M / 111320;
        const dLon = SLOPE_STEP_M / (111320 * Math.cos(f.lat * RAD));
        pts.push([f.lat, f.lon], [f.lat + dLat, f.lon], [f.lat - dLat, f.lon], [f.lat, f.lon + dLon], [f.lat, f.lon - dLon]);
      });
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${pts.map((p) => p[0].toFixed(5)).join(',')}&longitude=${pts.map((p) => p[1].toFixed(5)).join(',')}`;
      try {
        let response: JsonResponse | null = null;
        for (let k = 0; k < 4; k += 1) {
          try {
            response = await deps.fetcher(url);
          } catch {
            response = null;
          }
          if (response?.ok) break;
          await deps.sleep(4000 * 2 ** k);
        }
        if (!response || !response.ok) throw new Error(response ? `HTTP ${response.status}` : 'Failed to fetch');
        const body = (await response.json()) as { elevation: number[] };
        part.forEach((f, k) => {
          delete status[`${f.id}:slope`];
          SLOPE[f.id] = slopeFromSamples(f, body.elevation.slice(k * 5, k * 5 + 5), deps.now());
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        part.forEach((f) => {
          status[`${f.id}:slope`] = message;
          failed.push(f.id);
        });
      }
      await deps.sleep(600);
    }
    write('aq-gis-slope', SLOPE);
    emit();
    return failed;
  }

  async function fetchSite(farm: GeoFarm): Promise<void> {
    status[farm.id] = 'loading';
    emit();
    const query = overpassQuery(farm);
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const response = await deps.fetcher(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
        });
        if (!response.ok) throw new HttpStatusError(response.status);
        SITE[farm.id] = parseOverpass(farm, await response.json(), deps.now());
        write('aq-gis-site', SITE);
        status[farm.id] = 'ok';
        emit();
        return;
      } catch (error) {
        status[`${farm.id}:err`] = classifyFetchFailure(error).detail;
      }
    }
    status[farm.id] = 'error';
    status[`${farm.id}:at`] = String(deps.now());
    emit();
  }

  const queue: GeoFarm[] = [];
  let busy = false;
  let last = 0;

  async function pump(): Promise<void> {
    if (busy || !queue.length) return;
    busy = true;
    const farm = queue.shift();
    if (farm) {
      await deps.sleep(Math.max(0, last + OVERPASS_GAP_MS - deps.now()));
      last = deps.now();
      await fetchSite(farm);
    }
    busy = false;
    void pump();
  }

  function site(f: GeoFarm): SiteSnapshot | null {
    const cached = SITE[f.id];
    if (cached && sameSpot(cached, f) && deps.now() - cached.at < SITE_TTL_MS) return cached;
    const st = status[f.id];
    const retryOk = st === 'error' && deps.now() - Number(status[`${f.id}:at`] ?? 0) > 60000;
    if ((!st || retryOk) && !queue.some((q) => q.id === f.id)) {
      status[f.id] = 'queued';
      queue.push(f);
      void pump();
      emit();
    }
    return null;
  }

  const peek = (f: GeoFarm): SiteSnapshot | null => (sameSpot(SITE[f.id], f) ? SITE[f.id] : null);

  function analyse(f: GeoFarm, context: Omit<AnalyseInput, 'site' | 'slope'>, fetchIt = false): SiteAnalysis & { status: string; err: string | undefined } {
    const snapshot = fetchIt ? site(f) : peek(f);
    const slope = sameSpot(SLOPE[f.id], f) ? SLOPE[f.id] : null;
    const result = analyseSite({ ...context, site: snapshot, slope });
    return { ...result, status: status[f.id] ?? (snapshot ? 'ok' : 'idle'), err: status[`${f.id}:err`] };
  }

  return {
    site,
    slopes,
    analyse,
    slope: (id: string): SlopeSample | null => SLOPE[id] ?? null,
    status: (id: string): string | undefined => status[id],
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export type Gis = ReturnType<typeof createGis>;
