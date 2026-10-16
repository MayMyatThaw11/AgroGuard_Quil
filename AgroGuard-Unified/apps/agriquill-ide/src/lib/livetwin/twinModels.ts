import type {
  ArchivePayload,
  DayRow,
  Farm,
  ForecastPayload,
  Machine,
  Paddy,
  WaterEvent,
} from './twinTypes.ts';

export const A = {
  gddBase: 10,
  gddCap: 35,
  stages: [
    ['Seedling', 0],
    ['Tillering', 150],
    ['Panicle Initiation', 750],
    ['Booting', 1000],
    ['Heading', 1250],
    ['Ripening', 1500],
    ['Mature', 2050],
  ] as const,
  kc: { ini: 1.05, mid: 1.2, end: 0.9 },
  startWaterCm: 5,
  awdTrigger: -15,
  awdRefill: 5,
  floorCm: -30,
  drainFromGdd: 1800,
  seepageBand: 2,
  roadFactor: 1.3,
  setupH: 0.25,
  drainCmPerH: 2,
  sprinklerCm: 1.5,
} as const;

export const ASSUMPTIONS: readonly string[] = [
  `Stage from GDD: base ${A.gddBase} °C, Tmax capped at ${A.gddCap} °C; generic 120-day indica thresholds (calibrate per variety).`,
  `Kc (FAO-56 rice): ${A.kc.ini} initial → ${A.kc.mid} mid-season → ${A.kc.end} late.`,
  `Water starts at +${A.startWaterCm} cm on the transplant date; overflow at bund height.`,
  `Past management assumed AWD: re-flood to +${A.awdRefill} cm when water reaches ${A.awdTrigger} cm; no irrigation after ${A.drainFromGdd} °C·d (pre-harvest drain).`,
  `Forecast days apply no automatic irrigation, so the forecast shows when action is needed. Band = seepage ±${A.seepageBand} mm/d.`,
  `Routing: straight-line distance × ${A.roadFactor} for ground machines, straight line for drones; ${Math.round(A.setupH * 60)} min setup per task.`,
  `Pump time = volume ÷ rated flow; application losses are not modelled. Drain by gravity at ~${A.drainCmPerH} cm/h.`,
];

const DAY = 86400000;
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (date: string, n: number): string => dateKey(new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY));
export const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

export function gddDay(tx: number | null, tn: number | null): number | null {
  if (tx == null || tn == null) return null;
  return Math.max(0, (Math.min(tx, A.gddCap) + Math.max(tn, A.gddBase)) / 2 - A.gddBase);
}

export function stageOf(gdd: number): string {
  let stage: string = A.stages[0][0];
  for (const [name, threshold] of A.stages) if (gdd >= threshold) stage = name;
  return stage;
}

export function kcOf(g: number): number {
  if (g < 150) return A.kc.ini;
  if (g < 750) return A.kc.ini + ((A.kc.mid - A.kc.ini) * (g - 150)) / 600;
  if (g < 1500) return A.kc.mid;
  if (g < 2050) return A.kc.mid + ((A.kc.end - A.kc.mid) * (g - 1500)) / 550;
  return A.kc.end;
}

export function dayTable(fc: ForecastPayload | null | undefined, ar: ArchivePayload | null | undefined): Record<string, DayRow> {
  const table: Record<string, DayRow> = {};
  const put = (daily: ForecastPayload['daily'] | undefined) => {
    if (!daily || !daily.time) return;
    daily.time.forEach((t, i) => {
      table[t] = {
        tx: daily.temperature_2m_max[i],
        tn: daily.temperature_2m_min[i],
        p: daily.precipitation_sum[i],
        et0: daily.et0_fao_evapotranspiration[i],
      };
    });
  };
  put(ar?.daily);
  put(fc?.daily);
  return table;
}

export interface PaddyModel {
  id: string;
  variety: string;
  areaHa: number;
  transplanted: string;
  day: number;
  gdd: number;
  stage: string;
  kc: number;
  water: number;
  low: number;
  lowDry: number;
  lowWet: number;
  observed: number[];
  dates: string[];
  forecast: number[];
  band: [number, number][];
  harvestIn: number | null;
  gPerDay: number | null;
  autoIrrCm: number;
  autoIrrM3: number;
  autoIrrN: number;
  gaps: number;
  sensor: boolean;
  defaults: string[];
}

export function paddyModel(pd: Paddy, table: Record<string, DayRow>, today: string, frac: number, events?: readonly WaterEvent[]): PaddyModel {
  const start = pd.transplanted;
  const nPast = daysBetween(start, today);
  let water: number = A.startWaterCm;
  let gdd = 0;
  let gaps = 0;
  let autoCm = 0;
  let autoN = 0;
  const hist: number[] = [];
  const dates: string[] = [];
  const ev: Record<string, number> = {};
  (events ?? []).forEach((e) => {
    ev[e.date] = (ev[e.date] ?? 0) + e.cm;
  });
  const step = (d: string, k: number, auto: boolean, seep: number): boolean => {
    const r = table[d];
    if (!r || r.p == null || r.et0 == null) {
      gaps += 1;
      return false;
    }
    const gd = gddDay(r.tx, r.tn);
    if (gd == null) gaps += 1;
    else gdd += gd * k;
    water += ((r.p - kcOf(gdd) * r.et0 - seep) / 10) * k + (ev[d] ?? 0);
    if (auto && water <= A.awdTrigger && gdd < A.drainFromGdd) {
      autoCm += A.awdRefill - water;
      autoN += 1;
      water = A.awdRefill;
    }
    water = Math.max(A.floorCm, Math.min(pd.bundCm, water));
    return true;
  };
  for (let i = 0; i < nPast; i += 1) {
    const d = addDays(start, i);
    step(d, 1, true, pd.seepageMmDay);
    if (pd.sensor && pd.sensor.at.slice(0, 10) === d) water = pd.sensor.waterCm;
    if (nPast - i <= 26) {
      hist.push(+water.toFixed(2));
      dates.push(d);
    }
  }
  step(today, frac, true, pd.seepageMmDay);
  const now = +water.toFixed(2);
  const gddNow = gdd;
  if (pd.sensor && pd.sensor.at.slice(0, 10) === today) water = pd.sensor.waterCm;
  const project = (seep: number): number[] => {
    let w = water;
    let gg = gdd;
    const out = [+w.toFixed(2)];
    const rest = table[today];
    if (rest && rest.p != null && rest.et0 != null) {
      w += ((rest.p - kcOf(gg) * rest.et0 - seep) / 10) * (1 - frac);
      w = Math.max(A.floorCm, Math.min(pd.bundCm, w));
    }
    for (let i = 1; i <= 6; i += 1) {
      const d = addDays(today, i);
      const r = table[d];
      if (!r || r.p == null || r.et0 == null) break;
      const gd = gddDay(r.tx, r.tn);
      if (gd != null) gg += gd;
      w += (r.p - kcOf(gg) * r.et0 - seep) / 10 + (ev[d] ?? 0);
      w = Math.max(A.floorCm, Math.min(pd.bundCm, w));
      out.push(+w.toFixed(2));
    }
    return out;
  };
  const mid = project(pd.seepageMmDay);
  const dry = project(pd.seepageMmDay + A.seepageBand);
  const wet = project(Math.max(0, pd.seepageMmDay - A.seepageBand));
  let recent = 0;
  let recentN = 0;
  for (let i = 1; i <= 7; i += 1) {
    const r = table[addDays(today, -i)];
    const gd = r ? gddDay(r.tx, r.tn) : null;
    if (gd != null) {
      recent += gd;
      recentN += 1;
    }
  }
  const gPerDay = recentN ? recent / recentN : null;
  return {
    id: pd.id,
    variety: pd.variety,
    areaHa: pd.areaHa,
    transplanted: start,
    day: nPast,
    gdd: Math.round(gddNow),
    stage: stageOf(gddNow),
    kc: +kcOf(gddNow).toFixed(2),
    water: now,
    low: Math.min(...mid),
    lowDry: Math.min(...dry),
    lowWet: Math.min(...wet),
    observed: hist.concat(now),
    dates: dates.concat(today),
    forecast: mid,
    band: mid.map((value, i): [number, number] => [dry[i] ?? value, wet[i] ?? value]),
    harvestIn: gPerDay ? Math.max(0, Math.round((2050 - gddNow) / gPerDay)) : null,
    gPerDay: gPerDay != null ? +gPerDay.toFixed(1) : null,
    autoIrrCm: +autoCm.toFixed(1),
    autoIrrM3: Math.round(autoCm * pd.areaHa * 100),
    autoIrrN: autoN,
    gaps,
    sensor: Boolean(pd.sensor),
    defaults: pd.defaults,
  };
}

export type FarmStatus = 'nodata' | 'alert' | 'watch' | 'ok';

export interface FarmModel {
  status: FarmStatus;
  paddies: PaddyModel[];
  today?: string;
  lowest?: number;
  alerts?: number;
  watch?: number;
  et0Today?: number | null;
  rain72h?: number | null;
  rain7d?: number | null;
  rainPast7d?: number | null;
  gaps?: number;
  archive?: boolean;
}

export function farmModel(
  farm: Farm,
  fc: ForecastPayload | null | undefined,
  ar: ArchivePayload | null | undefined,
  events?: Readonly<Record<string, readonly WaterEvent[]>>,
): FarmModel {
  if (!fc || !fc.daily || !fc.current) return { status: 'nodata', paddies: [] };
  const today = fc.current.time.slice(0, 10);
  const hour = Number(fc.current.time.slice(11, 13)) || 0;
  const minute = Number(fc.current.time.slice(14, 16)) || 0;
  const frac = (hour + minute / 60) / 24;
  const table = dayTable(fc, ar);
  const paddies = farm.paddies.map((p) => paddyModel(p, table, today, frac, events?.[p.id]));
  const lowest = Math.min(...paddies.map((p) => p.low));
  const alerts = paddies.filter((p) => p.low <= A.awdTrigger).length;
  const watch = paddies.filter((p) => p.low > A.awdTrigger && p.low <= -12.5).length;
  const i0 = fc.daily.time.indexOf(today);
  const sum = (series: (number | null)[], from: number, to: number) => {
    let total = 0;
    for (let i = from; i < to; i += 1) total += series[i] ?? 0;
    return total;
  };
  const rain = fc.daily.precipitation_sum;
  return {
    today,
    paddies,
    lowest,
    alerts,
    watch,
    status: alerts ? 'alert' : watch ? 'watch' : 'ok',
    et0Today: i0 >= 0 ? fc.daily.et0_fao_evapotranspiration[i0] : null,
    rain72h: i0 >= 0 ? +sum(rain, i0, i0 + 3).toFixed(1) : null,
    rain7d: i0 >= 0 ? +sum(rain, i0, i0 + 7).toFixed(1) : null,
    rainPast7d: i0 >= 0 ? +sum(rain, Math.max(0, i0 - 7), i0).toFixed(1) : null,
    gaps: paddies.reduce((total, p) => total + p.gaps, 0),
    archive: Boolean(ar),
  };
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface TravelPlace extends GeoPoint {
  id?: string;
  country?: string;
}

export interface TravelResult {
  km: number;
  h: number;
  ok: boolean;
  why?: string;
}

const EARTH_KM = 6371;

export function haversine(a: GeoPoint, b: GeoPoint): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

export function travel(machine: Machine, from: TravelPlace, to: TravelPlace): TravelResult {
  if (machine.kind === 'pump') return { km: 0, h: 0, ok: machine.farmId === to.id };
  if (from.country && to.country && from.country !== to.country) return { km: 0, h: 0, ok: false, why: `based in ${from.country}` };
  const straight = haversine(from, to);
  const km = machine.kind === 'drone' ? straight : straight * A.roadFactor;
  if (machine.kind === 'drone' && machine.rangeKm != null && straight > machine.rangeKm) {
    return { km, h: km / machine.speedKmh, ok: false, why: `beyond ${machine.rangeKm} km range` };
  }
  return { km, h: km / machine.speedKmh, ok: true };
}

export function pumpDepth(action: string, pm: Pick<PaddyModel, 'water'>): number {
  if (action === 'Run sprinklers') return A.sprinklerCm;
  if (action === 'Flood to +5 cm') return Math.max(0, 5 - pm.water);
  if (action === 'Drain paddy') return -Math.max(0, pm.water + 10);
  return 0;
}

export interface WorkResult {
  h: number;
  m3: number;
  area: number;
}

export function workHours(machine: Machine, action: string, pms: readonly Pick<PaddyModel, 'water' | 'areaHa'>[]): WorkResult | null {
  const area = pms.reduce((total, p) => total + p.areaHa, 0);
  if (machine.kind === 'pump') {
    if (!machine.flowM3h) return null;
    const cm = pms.reduce((total, p) => total + Math.abs(pumpDepth(action, p)) * p.areaHa * 100, 0);
    if (action === 'Drain paddy') {
      const maxCm = Math.max(0, ...pms.map((p) => -pumpDepth(action, p)));
      return { h: maxCm / A.drainCmPerH, m3: 0, area };
    }
    return { h: cm / machine.flowM3h, m3: Math.round(cm), area };
  }
  const rate = machine.rates[action];
  if (!rate) return null;
  return { h: A.setupH + area / rate, m3: 0, area };
}
