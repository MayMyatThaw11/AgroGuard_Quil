import type { StorageLike } from '../paddySettings.ts';
import { AVOID, CONTROLS, PESTS, PEST_IDS, type Control, type ControlType, type PestId, type RiskContext } from './twinIpmData.ts';
import type { SiteAnalysis } from './twinGis.ts';
import type { FarmModel, PaddyModel } from './twinModels.ts';
import { SPRAY_RAIN_LIMIT_MM_H, SPRAY_WIND_LIMIT_KMH, type WeatherNow } from './twinWeather.ts';
import type { Farm, ForecastPayload, PlanConfig } from './twinTypes.ts';
import type { SoilMoisture, SoilProfile } from './twinOpenMeteo.ts';

const DAY = 86400000;

export interface ScoutRecord {
  id: string;
  at: number;
  by: string;
  farmId: string;
  paddyId: string;
  pest: PestId;
  count: number;
  pctArea?: number;
  day?: number;
  stage?: string | null;
  demo?: boolean;
}

export interface SprayRecord {
  id: string;
  at: number;
  farmId: string;
  paddyId: string;
  type: ControlType;
  group?: string;
  controlId?: string;
  name?: string;
  pest?: PestId;
  taskId?: string;
  areaHa?: number;
  day?: number;
  demo?: boolean;
}

export type ScoutInput = Omit<ScoutRecord, 'id' | 'at' | 'by'> & Partial<Pick<ScoutRecord, 'at' | 'by'>>;
export type SprayInput = Omit<SprayRecord, 'id' | 'at'> & Partial<Pick<SprayRecord, 'at'>>;

export function createIpmLog(storage: StorageLike | null, now: () => number = () => Date.now()) {
  const read = <T>(key: string): T[] => {
    try {
      const raw = storage?.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  };
  const write = (key: string, value: unknown) => {
    try {
      storage?.setItem(key, JSON.stringify(value));
    } catch {
      return;
    }
  };
  let savedScouts = read<ScoutRecord>('aq-scout');
  let savedSprays = read<SprayRecord>('aq-spray');
  const index = new Map<string, { scout: ScoutRecord[]; spray: SprayRecord[] }>();
  const slot = (farmId: string, paddyId: string) => {
    const key = `${farmId}|${paddyId}`;
    let entry = index.get(key);
    if (!entry) {
      entry = { scout: [], spray: [] };
      index.set(key, entry);
    }
    return entry;
  };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const stamp = () => now().toString(36) + Math.random().toString(36).slice(2, 5);
  savedScouts.forEach((r) => slot(r.farmId, r.paddyId).scout.push(r));
  savedSprays.forEach((r) => slot(r.farmId, r.paddyId).spray.push(r));

  function logScout(input: ScoutInput): ScoutRecord {
    const rec: ScoutRecord = { id: `SC-${stamp()}`, at: now(), by: 'Crew entry', ...input };
    slot(rec.farmId, rec.paddyId).scout.push(rec);
    if (!rec.demo) {
      savedScouts = savedScouts.concat(rec).slice(-3000);
      write('aq-scout', savedScouts);
    }
    emit();
    return rec;
  }

  function logSpray(input: SprayInput): SprayRecord {
    const rec: SprayRecord = { id: `SP-${stamp()}`, at: now(), ...input };
    slot(rec.farmId, rec.paddyId).spray.push(rec);
    if (!rec.demo) {
      savedSprays = savedSprays.concat(rec).slice(-3000);
      write('aq-spray', savedSprays);
    }
    emit();
    return rec;
  }

  function seed(scouts: readonly ScoutRecord[], sprays: readonly SprayRecord[]): void {
    scouts.forEach((r) => slot(r.farmId, r.paddyId).scout.push(r));
    sprays.forEach((r) => slot(r.farmId, r.paddyId).spray.push(r));
    emit();
  }

  const scouts = (farm: Farm, paddyId?: string): ScoutRecord[] =>
    paddyId ? (index.get(`${farm.id}|${paddyId}`)?.scout ?? []) : farm.paddies.flatMap((p) => index.get(`${farm.id}|${p.id}`)?.scout ?? []);
  const sprays = (farm: Farm, paddyId?: string): SprayRecord[] =>
    paddyId ? (index.get(`${farm.id}|${paddyId}`)?.spray ?? []) : farm.paddies.flatMap((p) => index.get(`${farm.id}|${p.id}`)?.spray ?? []);

  function latest(farm: Farm, paddyId: string, pest: PestId, days = 10): ScoutRecord | null {
    const since = now() - days * DAY;
    let best: ScoutRecord | null = null;
    scouts(farm, paddyId).forEach((x) => {
      if (x.pest === pest && x.at >= since && (!best || x.at > best.at)) best = x;
    });
    return best;
  }

  return {
    logScout,
    logSpray,
    seed,
    scouts,
    sprays,
    latest,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export type IpmLog = ReturnType<typeof createIpmLog>;

export interface IpmContext extends RiskContext {
  farm: Farm;
  mod: FarmModel | undefined;
  pm: PaddyModel | null;
  soil: SoilProfile | null;
  soilm: SoilMoisture | null;
  plan: PlanConfig | null;
  organic: boolean;
  area: number;
  wind: number | null;
  rainNow: number;
  simulated: boolean;
  season: 'Wet spell' | 'Showery' | 'Dry spell' | null;
  rain7d: number;
  site: SiteAnalysis | null;
  ok: boolean;
}

export interface ContextInput {
  farm: Farm;
  model: FarmModel | undefined;
  paddyId?: string;
  weather: WeatherNow | null;
  soil: SoilProfile | null;
  soilMoisture: SoilMoisture | null;
  forecast: ForecastPayload | null;
  plan: PlanConfig | null;
  site: SiteAnalysis | null;
  log: IpmLog;
}

export function buildContext(input: ContextInput): IpmContext {
  const { farm, model: mod, weather: w, forecast: fc } = input;
  const pm = mod?.paddies.length ? (mod.paddies.find((p) => p.id === input.paddyId) ?? mod.paddies[0]) : null;
  let tmin: number | null = null;
  if (fc?.daily && mod?.today) {
    const i = fc.daily.time.indexOf(mod.today);
    if (i >= 0) tmin = fc.daily.temperature_2m_min[i];
  }
  const rainPast7d = mod?.rainPast7d ?? null;
  const season = rainPast7d == null ? null : rainPast7d >= 25 ? 'Wet spell' : rainPast7d >= 5 ? 'Showery' : 'Dry spell';
  const early = pm ? input.log.sprays(farm, pm.id).filter((x) => x.type !== 'cultural' && x.day != null && x.day < 40).length : 0;
  return {
    farm,
    mod,
    pm,
    soil: input.soil && !input.soil.empty ? input.soil : null,
    soilm: input.soilMoisture,
    plan: input.plan,
    organic: farm.organic,
    stage: pm ? pm.stage : null,
    day: pm ? pm.day : 0,
    water: pm ? pm.water : 0,
    area: pm ? pm.areaHa : 0,
    temp: w ? w.temp : null,
    rh: w ? w.rh : null,
    wind: w ? w.wind : null,
    gust: w ? w.gust : 0,
    rainNow: w ? w.rain : 0,
    simulated: Boolean(w?.simulated),
    tmin,
    rain72h: mod?.rain72h ?? 0,
    rain7d: mod?.rain7d ?? 0,
    rainPast7d: rainPast7d ?? 0,
    season,
    earlySprays: early,
    site: input.site,
    ok: Boolean(pm && w),
  };
}

export interface Risk {
  r: number;
  level: 'none' | 'low' | 'moderate' | 'high';
  why: string[];
}

export function risk(c: IpmContext, pestId: PestId): Risk {
  const pest = PESTS[pestId];
  const why: string[] = [];
  if (!c.ok || !c.stage || !pest.stages.includes(c.stage)) return { r: 0, level: 'none', why };
  const r = Math.max(0, Math.min(1, pest.risk(c, why)));
  return { r, level: r >= 0.6 ? 'high' : r >= 0.35 ? 'moderate' : 'low', why };
}

export type DecisionCode = 'scout' | 'hold' | 'act';
export type Tone = 'warning' | 'neutral' | 'accent' | 'alert';

export interface Decision {
  code: DecisionCode;
  label: string;
  tone: Tone;
  rk: Risk;
  rec: ScoutRecord | null;
  msg: string;
}

export function decide(c: IpmContext, pestId: PestId, log: IpmLog): Decision {
  const pest = PESTS[pestId];
  const rk = risk(c, pestId);
  const rec = c.pm ? log.latest(c.farm, c.pm.id, pestId, 10) : null;
  if (!rec) return { code: 'scout', label: 'Scout first', tone: rk.level === 'high' ? 'warning' : 'neutral', rk, rec, msg: `No count in the last 10 days. ${pest.how}` };
  const ratio = rec.count / pest.threshold;
  if (ratio < 1) return { code: 'hold', label: 'Below threshold', tone: 'accent', rk, rec, msg: `${rec.count} ${pest.unit} vs action threshold ${pest.threshold}. No spray; natural enemies keep it in check.` };
  if (pestId === 'lf' && c.day < 40 && ratio < 2) return { code: 'hold', label: 'Hold · early season', tone: 'warning', rk, rec, msg: `Day ${c.day}: rice compensates for early leaf damage. Spraying now mostly kills spiders and mirid bugs.` };
  if (pestId === 'blb') return { code: 'act', label: 'Manage, no spray', tone: 'alert', rk, rec, msg: `${rec.count} ${pest.unit}. No curative spray works; drain, hold N and remove infected stubble.` };
  return { code: 'act', label: 'Act', tone: 'alert', rk, rec, msg: `${rec.count} ${pest.unit} is ${ratio.toFixed(1)}× the threshold of ${pest.threshold}. Start at the top of the ladder.` };
}

export function sprayHold(c: Pick<IpmContext, 'wind' | 'rainNow'>): string | null {
  if (c.wind != null && c.wind > SPRAY_WIND_LIMIT_KMH) return `wind ${Math.round(c.wind)} km/h > ${SPRAY_WIND_LIMIT_KMH} km/h drift limit`;
  if (c.rainNow > SPRAY_RAIN_LIMIT_MM_H) return `raining ${c.rainNow.toFixed(1)} mm/h`;
  return null;
}

export type Sign = '+' | '−' | '·';

export interface RankedControl {
  c: Control;
  score: number;
  why: [Sign, string][];
  hold: string | null;
}

export interface ExcludedControl {
  c: Control;
  why: string[];
}

export interface Ranking {
  options: RankedControl[];
  excluded: ExcludedControl[];
  avoid: (typeof AVOID)[number][];
  hold: string | null;
}

export function rank(c: IpmContext, pestId: PestId, log: IpmLog, now: number = Date.now()): Ranking {
  const options: RankedControl[] = [];
  const excluded: ExcludedControl[] = [];
  const plan = c.plan;
  const used = c.pm ? log.sprays(c.farm, c.pm.id) : [];
  const hold = sprayHold(c);
  const G = c.site;
  CONTROLS.filter((x) => x.targets.includes(pestId)).forEach((x) => {
    const no: string[] = [];
    if (c.organic && !x.organic) no.push('Organic farm (ASOA): synthetic products not allowed');
    if (plan?.protect === 'bio' && x.type === 'chemical') no.push('Plan is biocontrol-only');
    if (plan?.system === 'ricefish' && x.fish === 'high') no.push('Rice–fish plan: toxic to fish');
    if (x.needsSystem && plan?.system !== x.needsSystem) no.push('Needs the rice–duck integration in the practice plan');
    if (x.noStages && c.stage && x.noStages.includes(c.stage)) no.push(`Not at ${c.stage.toLowerCase()} (stress-sensitive)`);
    if (x.onlyStages && !(c.stage && x.onlyStages.includes(c.stage))) no.push(`Only at ${x.onlyStages.join(' / ').toLowerCase()}`);
    if (x.maxDay != null && c.day >= x.maxDay) no.push(`Applies before day ${x.maxDay}`);
    if (x.minDay != null && c.day < x.minDay) no.push(`From day ${x.minDay}`);
    if (no.length) {
      excluded.push({ c: x, why: no });
      return;
    }
    const why: [Sign, string][] = [];
    let s = x.eff * 12 + x.sel * 10;
    if (x.type === 'cultural') {
      s += 18;
      why.push(['+', 'Cultural: no product cost']);
    } else if (x.type === 'biological') {
      s += 12;
      why.push(['+', 'Biological: spares natural enemies']);
    }
    if (x.sel === 3 && x.type === 'chemical') why.push(['+', 'Selective: spares spiders & mirid bugs']);
    if (x.fish === 'moderate') {
      s -= 4;
      why.push(['−', 'Moderate fish toxicity']);
    }
    if (x.fish === 'high') {
      s -= 12;
      why.push(['−', 'High fish toxicity']);
    }
    if (x.bee === 'high') {
      s -= 8;
      why.push(['−', 'High bee hazard']);
    }
    if (G?.protectedNear && (x.fish === 'high' || x.bee === 'high')) {
      s -= 12;
      why.push(['−', 'Protected area within 3 km (OSM)']);
    }
    if (G && G.waterM != null && G.waterM < 300 && x.fish !== 'low' && x.type === 'chemical') {
      s -= 6;
      why.push(['−', `Open water ${Math.round(G.waterM)} m away: drift and runoff`]);
    }
    if (x.group) {
      const same = used.filter((u) => u.group === x.group).sort((a, b) => b.at - a.at)[0];
      if (same) {
        s -= 15;
        why.push(['−', `Same mode of action (${x.group}) used ${Math.max(0, Math.round((now - same.at) / DAY))} d ago; rotate`]);
      }
    }
    if (x.apply === 'foliar' || x.apply === 'release') {
      if (c.rain72h >= 20) {
        s -= 10;
        why.push(['−', `${c.rain72h.toFixed(0)} mm rain in 72 h may wash it off`]);
      } else why.push(['+', `Dry window: ${c.rain72h.toFixed(0)} mm in 72 h`]);
      if (x.rhMin != null && c.rh != null) {
        if (c.rh >= x.rhMin) {
          s += 8;
          why.push(['+', `RH ${Math.round(c.rh)}% suits fungal spores`]);
        } else {
          s -= 10;
          why.push(['−', `RH ${Math.round(c.rh)}% < ${x.rhMin}%: spores dry out`]);
        }
      }
      if (x.tempMax != null && c.temp != null && c.temp > x.tempMax) {
        s -= 8;
        why.push(['−', `${Math.round(c.temp)} °C above ${x.tempMax} °C`]);
      }
      if (x.uv) why.push(['·', 'Spray in the evening (UV)']);
    }
    if (x.apply === 'soil') {
      if (c.soil && c.soil.ph != null && x.phMin != null && x.phMax != null) {
        if (c.soil.ph >= x.phMin && c.soil.ph <= x.phMax) {
          s += 5;
          why.push(['+', `Soil pH ${c.soil.ph.toFixed(1)} (SoilGrids) suits it`]);
        } else {
          s -= 6;
          why.push(['−', `Soil pH ${c.soil.ph.toFixed(1)} outside ${x.phMin}–${x.phMax}`]);
        }
      } else why.push(['·', 'Soil pH: no data yet']);
      if (c.soil && c.soil.soc != null && c.soil.soc >= 15) {
        s += 3;
        why.push(['+', `Organic carbon ${c.soil.soc.toFixed(0)} g/kg`]);
      }
    }
    if (x.type === 'chemical' && c.soil && c.soil.sand != null && c.soil.sand >= 50) {
      s -= 5;
      why.push(['−', `Sandy soil (${Math.round(c.soil.sand)}% sand): leaching risk`]);
    }
    if (x.id === 'drain' || x.id === 'shallow') {
      if (c.rain72h >= 20) {
        s -= 10;
        why.push(['−', `${c.rain72h.toFixed(0)} mm rain due will refill it`]);
      }
      if (x.id === 'drain' && c.water <= -5) {
        s += 6;
        why.push(['+', `Already drying (${c.water.toFixed(0)} cm, model)`]);
      }
      if (x.id === 'shallow' && c.water > 2) {
        s += 8;
        why.push(['+', `Water now ${c.water.toFixed(1)} cm (model)`]);
      }
      if (c.soil && c.soil.clay != null && c.soil.clay >= 40) why.push(['·', `Clay ${Math.round(c.soil.clay)}%: drains slowly`]);
      if (c.soilm && c.soilm.mid != null) why.push(['·', `Soil moisture 3–9 cm ${c.soilm.mid.toFixed(2)} m³/m³ (Open-Meteo)`]);
    }
    if (plan?.system === 'riceduck' && x.id === 'ducks') s += 10;
    const needsSpray = x.apply === 'foliar' || (x.apply === 'water' && x.type === 'chemical');
    options.push({ c: x, score: Math.max(0, Math.min(100, Math.round(s))), why, hold: needsSpray && hold ? hold : null });
  });
  options.sort((a, b) => b.score - a.score);
  return { options, excluded, avoid: AVOID.filter((a) => a.targets.includes(pestId)), hold };
}

export function spot(c: Pick<IpmContext, 'area'>, rec: Pick<ScoutRecord, 'pctArea'> | null): { pct: number | null; treatedHa: number | null; blanketHa: number } {
  const pct = rec && rec.pctArea != null ? Math.max(1, Math.min(100, rec.pctArea)) : null;
  return { pct, treatedHa: pct != null ? +((c.area * pct) / 100).toFixed(2) : null, blanketHa: +c.area.toFixed(2) };
}

export interface Advice {
  c: IpmContext;
  list: { id: PestId; p: (typeof PESTS)[PestId]; d: Decision }[];
}

export function advise(c: IpmContext, log: IpmLog): Advice {
  const list = PEST_IDS.map((id) => ({ id, p: PESTS[id], d: decide(c, id, log) })).filter((x) => x.d.rk.level !== 'none' || x.d.rec);
  const order: Record<DecisionCode, number> = { act: 0, scout: 1, hold: 2 };
  list.sort((a, b) => order[a.d.code] - order[b.d.code] || b.d.rk.r - a.d.rk.r);
  return { c, list };
}
