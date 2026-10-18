import type { StorageLike } from '../paddySettings.ts';
import type { IpmLog } from './twinIpm.ts';
import { A, addDays, daysBetween, dayTable, gddDay, kcOf, type FarmModel } from './twinModels.ts';
import { DEMO_COSTS, optionOf, TRADITIONAL, type PlanCosts } from './twinPlansData.ts';
import type { SiteAnalysis } from './twinGis.ts';
import type { SoilProfile } from './twinOpenMeteo.ts';
import type { ArchivePayload, DayRow, Farm, ForecastPayload, Machine, MachineKind, Paddy, PlanConfig } from './twinTypes.ts';

export type CheckLevel = 'adjust' | 'block' | 'warn' | 'info';

export interface CheckIssue {
  level: CheckLevel;
  msg: string;
}

export interface CheckResult {
  cfg: PlanConfig;
  issues: CheckIssue[];
  blocked: boolean;
}

export interface PlanRecord {
  active: PlanConfig;
  draft: PlanConfig | null;
  approvedAt: number | null;
  by: string;
  history?: { at: number; from: PlanConfig; to: PlanConfig }[];
}

export interface PlanTarget {
  farmId: string;
  paddyIds: string[];
}

export interface PlanRequest {
  kind: MachineKind;
  action: string;
  targets: PlanTarget[];
  text?: string;
  override?: boolean;
  machineId?: string;
}

export interface SkippedItem {
  farmId: string;
  paddyId?: string;
  why: string;
}

export interface PlanResult<T> {
  tasks: T[];
  skipped: SkippedItem[];
  at: number;
}

export interface PlanEnv<T = unknown> {
  farm: (id: string) => Farm | undefined;
  model: (id: string) => FarmModel | undefined;
  forecast: (id: string) => ForecastPayload | undefined;
  archive: (id: string) => ArchivePayload | undefined;
  soil: (id: string) => SoilProfile | undefined;
  machines: () => readonly Machine[];
  site: (id: string) => SiteAnalysis | null;
  log: IpmLog;
  schedule: (request: PlanRequest) => PlanResult<T>;
}

export interface PaddyReplay {
  cm: number;
  m3: number;
  n: number;
  stress: number;
  gaps: number;
  fcM3: number;
  firstNeed: string | null;
}

export interface FarmReplay {
  strat: string;
  per: (PaddyReplay & { id: string; areaHa: number })[];
  m3: number;
  n: number;
  stress: number;
  gaps: number;
  fcM3: number;
  pumpH: number;
}

export interface Outcome {
  cfg: PlanConfig;
  water: FarmReplay | null;
  trad: FarmReplay | null;
  savedM3: number | null;
  savedPct: number | null;
  pest: { calN: number; calHa: number; planN: number; planHa: number; avoidedN: number; avoidedHa: number; chemHa: number };
  till: { passes: number; savedHa: number; savedH: number | null };
  money: { water: number; spray: number; till: number; total: number };
  area: number;
  checks: CheckIssue[];
}

export interface WeekNeed {
  kind: MachineKind;
  action: string;
  paddyIds: string[];
  why: string;
}

const DAY = 86400000;
const PUMP_M3_PER_HOUR = 150;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function defaultPlan(farm: Farm | undefined): PlanConfig {
  return { water: 'awd', protect: 'ipm', nutrient: farm?.organic ? 'organic' : 'fixed', tillage: 'puddle', system: 'mono' };
}

export function createPlans<T>(env: PlanEnv<T>, storage: StorageLike | null, now: () => number = () => Date.now()) {
  const read = <T>(key: string, fallback: T): T => {
    try {
      const raw = storage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key: string, value: unknown) => {
    try {
      storage?.setItem(key, JSON.stringify(value));
    } catch {
      return;
    }
  };
  const plans = read<Record<string, PlanRecord>>('aq-plans', {});
  let costs: PlanCosts = read<PlanCosts | null>('aq-costs', null) ?? { ...DEMO_COSTS };
  const demo: Record<string, PlanRecord> = {};
  const listeners = new Set<() => void>();
  let version = 0;
  const emit = () => {
    version += 1;
    listeners.forEach((fn) => fn());
  };
  const save = () => {
    write('aq-plans', plans);
    emit();
  };

  function seedPlans(map: Record<string, PlanRecord>): void {
    Object.assign(demo, map);
    emit();
  }

  function get(id: string): PlanRecord {
    return plans[id] ?? demo[id] ?? { active: defaultPlan(env.farm(id)), draft: null, approvedAt: null, by: 'default' };
  }

  function check(f: Farm | undefined, cfg: PlanConfig): CheckResult {
    const c: PlanConfig = { ...cfg };
    const out: CheckIssue[] = [];
    const soil = f ? env.soil(f.id) : undefined;
    if (f?.organic && c.protect === 'calendar') {
      c.protect = 'ipm';
      out.push({ level: 'adjust', msg: 'Organic farm: calendar spraying replaced by threshold IPM with organic-only products (ASOA).' });
    }
    if (f?.organic && c.nutrient === 'fixed') {
      c.nutrient = 'organic';
      out.push({ level: 'adjust', msg: 'Organic farm: urea not allowed, switched to compost + vermicompost.' });
    }
    const awd = c.water === 'awd' || c.water === 'awdfc';
    if (c.system === 'ricefish' && c.water === 'rainfed') out.push({ level: 'block', msg: 'Rice–fish needs standing water; rainfed cannot hold fish.' });
    if (c.system === 'ricefish' && c.protect === 'calendar') out.push({ level: 'block', msg: 'Calendar spraying would kill the fish. Use IPM or biocontrol.' });
    if (c.system === 'ricefish' && awd) out.push({ level: 'warn', msg: 'AWD with fish needs a refuge trench (~10% of area); dry-downs stop at trench level.' });
    if (c.system === 'riceduck' && c.protect === 'calendar') out.push({ level: 'warn', msg: 'Ducks and calendar spraying conflict; ducks must leave before every spray.' });
    if (c.system === 'riceduck' && c.water === 'rainfed') out.push({ level: 'warn', msg: 'Ducks need shallow standing water for the first 6 weeks.' });
    if (c.tillage === 'mintill') out.push({ level: 'info', msg: 'Minimum tillage raises early weed pressure; plan robot weeding before canopy closure (~day 45).' });
    if (c.nutrient === 'lcc') out.push({ level: 'info', msg: 'Leaf colour chart readings are not connected yet; the crew logs them in the field.' });
    if (c.system === 'legume') out.push({ level: 'info', msg: 'Rotation starts after harvest; no effect on this season’s numbers.' });
    if (soil && !soil.empty && soil.sand != null && soil.sand >= 60 && awd) {
      out.push({ level: 'warn', msg: `Sandy soil (${Math.round(soil.sand)}% sand, SoilGrids): AWD cycles will be short; check with a gauge.` });
    }
    const G = f ? env.site(f.id) : null;
    if (G) {
      if (c.system === 'ricefish' && G.s && (G.waterM == null || G.waterM > 1500)) out.push({ level: 'warn', msg: 'Rice–fish: no mapped river, canal or pond within 1.5 km (OpenStreetMap). Confirm a year-round water source.' });
      if (c.system === 'ricefish' && G.flood === 'high') out.push({ level: 'warn', msg: 'Flood-prone site (low elevation near a river): raise bunds and screen outlets so fish do not escape.' });
      if (G.slope != null && G.slope > 5 && (c.water === 'flood' || c.water === 'ssc')) out.push({ level: 'warn', msg: `Slope ${G.slope}% (DEM): ponded water needs terraces; consider minimum tillage and contour bunds.` });
      if (G.protectedNear && c.protect === 'calendar') out.push({ level: 'warn', msg: 'Protected area within 3 km: calendar spraying conflicts with the buffer. Use IPM.' });
      if (G.saline === 'possible' && c.water !== 'rainfed') out.push({ level: 'info', msg: 'Coastal delta site: pump only when river salinity is low; salt-tolerant varieties reduce risk.' });
    }
    return { cfg: c, issues: out, blocked: out.some((x) => x.level === 'block') };
  }

  function setDraft(id: string, patch: Partial<PlanConfig>): CheckResult {
    const cur = get(id);
    const result = check(env.farm(id), { ...(cur.draft ?? cur.active), ...patch });
    plans[id] = { ...cur, draft: result.cfg, by: cur.by === 'default' ? 'draft' : cur.by };
    save();
    return result;
  }

  function applyTemplate(ids: readonly string[], patch: Partial<PlanConfig>) {
    const report = { applied: [] as string[], adjusted: [] as { id: string; msgs: string[] }[], blocked: [] as { id: string; msgs: string[] }[] };
    ids.forEach((id) => {
      const f = env.farm(id);
      if (!f) return;
      const cur = get(id);
      const result = check(f, { ...(cur.draft ?? cur.active), ...patch });
      if (result.blocked) {
        report.blocked.push({ id, msgs: result.issues.filter((x) => x.level === 'block').map((x) => x.msg) });
        return;
      }
      plans[id] = { ...cur, draft: result.cfg };
      const adjusted = result.issues.filter((x) => x.level === 'adjust');
      if (adjusted.length) report.adjusted.push({ id, msgs: adjusted.map((x) => x.msg) });
      else report.applied.push(id);
    });
    save();
    return report;
  }

  function approve(ids: readonly string[], by = 'Cooperative manager'): void {
    const at = now();
    ids.forEach((id) => {
      const cur = get(id);
      if (!cur.draft) return;
      plans[id] = { active: cur.draft, draft: null, approvedAt: at, by, history: (cur.history ?? []).concat({ at, from: cur.active, to: cur.draft }).slice(-20) };
    });
    save();
  }

  function discard(ids: readonly string[]): void {
    ids.forEach((id) => {
      if (plans[id]) plans[id] = { ...plans[id], draft: null };
    });
    save();
  }

  function setCosts(patch: Partial<PlanCosts>): void {
    costs = { ...costs, ...patch, demo: false };
    write('aq-costs', costs);
    emit();
  }

  function resetCosts(): void {
    costs = { ...DEMO_COSTS };
    write('aq-costs', costs);
    emit();
  }

  let belowK = 1;

  function simPaddy(pd: Paddy, table: Record<string, DayRow>, today: string, strat: string) {
    const nPast = daysBetween(pd.transplanted, today);
    const bund = pd.bundCm || 10;
    let water: number = A.startWaterCm;
    let gdd = 0;
    let cm = 0;
    let n = 0;
    let stress = 0;
    let gaps = 0;
    let fcCm = 0;
    let firstNeed: string | null = null;
    for (let i = 0; i <= nPast + 6; i += 1) {
      const d = addDays(pd.transplanted, i);
      const r = table[d];
      if (!r || r.p == null || r.et0 == null) {
        gaps += 1;
        continue;
      }
      const gd = gddDay(r.tx, r.tn);
      if (gd != null) gdd += gd;
      const seep = pd.seepageMmDay * (water > 0 ? 1 : belowK);
      water = clamp(water + (r.p - kcOf(gdd) * r.et0 - seep) / 10, A.floorCm, bund);
      const flower = gdd >= 1100 && gdd <= 1400;
      const late = gdd >= A.drainFromGdd;
      let add = 0;
      if (!late && strat !== 'rainfed') {
        if (strat === 'flood') {
          if (water < 3) add = 5 - water;
        } else if (strat === 'ssc') {
          if (water < -2) add = 1 - water;
        } else {
          const trigger = flower ? 0 : A.awdTrigger;
          if (water <= trigger) {
            let skip = false;
            if (strat === 'awdfc' && water > -25 && !flower) {
              const r1 = table[addDays(d, 1)];
              const r2 = table[addDays(d, 2)];
              if ((r1?.p ?? 0) + (r2?.p ?? 0) >= 15) skip = true;
            }
            if (!skip) add = A.awdRefill - water;
          }
        }
      }
      if (add > 0) {
        cm += add;
        n += 1;
        water += add;
        if (i >= nPast) {
          fcCm += add;
          if (!firstNeed) firstNeed = d;
        }
      }
      if (water <= -25 || (flower && water < -10)) stress += 1;
    }
    return { cm, m3: cm * pd.areaHa * 100, n, stress, gaps, fcM3: fcCm * pd.areaHa * 100, firstNeed };
  }

  let cache = new WeakMap<FarmModel, { table: Record<string, DayRow>; results: Record<string, FarmReplay> }>();

  function simFarm(id: string, strat: string): FarmReplay | null {
    const f = env.farm(id);
    const mod = env.model(id);
    if (!f || !mod || !mod.paddies.length || !mod.today) return null;
    let entry = cache.get(mod);
    if (!entry) {
      entry = { table: dayTable(env.forecast(id), env.archive(id)), results: {} };
      cache.set(mod, entry);
    }
    if (entry.results[strat]) return entry.results[strat];
    const today = mod.today;
    const per = f.paddies.map((pd) => ({ id: pd.id, areaHa: pd.areaHa, ...simPaddy(pd, (entry as NonNullable<typeof entry>).table, today, strat) }));
    const sum = (key: 'm3' | 'n' | 'stress' | 'gaps' | 'fcM3') => per.reduce((total, p) => total + p[key], 0);
    const result: FarmReplay = { strat, per, m3: sum('m3'), n: sum('n'), stress: sum('stress'), gaps: sum('gaps'), fcM3: sum('fcM3'), pumpH: sum('m3') / PUMP_M3_PER_HOUR };
    entry.results[strat] = result;
    return result;
  }

  function outcome(id: string, cfgIn?: PlanConfig): Outcome | null {
    const f = env.farm(id);
    if (!f) return null;
    const mod = env.model(id);
    const cfg = cfgIn ?? get(id).active;
    const water = simFarm(id, cfg.water);
    const trad = simFarm(id, TRADITIONAL.water);
    const days = costs.calendarDays;
    let calN = 0;
    let calHa = 0;
    let logN = 0;
    let logHa = 0;
    let chemHa = 0;
    (mod?.paddies ?? []).forEach((pm) => {
      const due = days.filter((d) => d <= pm.day).length;
      calN += due;
      calHa += due * pm.areaHa;
      const logged = env.log.sprays(f, pm.id).filter((x) => x.type !== 'cultural');
      logN += logged.length;
      logged.forEach((x) => {
        logHa += x.areaHa ?? 0;
        if (x.type === 'chemical') chemHa += x.areaHa ?? 0;
      });
    });
    const planHa = cfg.protect === 'calendar' ? calHa : logHa;
    const planN = cfg.protect === 'calendar' ? calN : logN;
    const area = f.paddies.reduce((total, p) => total + p.areaHa, 0);
    const tractor = env.machines().find((m) => m.kind === 'tractor' && m.rates['Till soil']);
    const tillRate = tractor ? tractor.rates['Till soil'] : null;
    const passes = cfg.tillage === 'mintill' ? 1 : 2;
    const tillSavedHa = (2 - passes) * area;
    const savedM3 = water && trad ? trad.m3 - water.m3 : null;
    const avoidedHa = calHa - planHa;
    const money = { water: savedM3 != null ? savedM3 * costs.waterPerM3 : 0, spray: avoidedHa * costs.sprayPerHa, till: tillSavedHa * costs.tillPerHa, total: 0 };
    money.total = money.water + money.spray + money.till;
    return {
      cfg,
      water,
      trad,
      savedM3,
      savedPct: water && trad && trad.m3 > 0 && savedM3 != null ? (savedM3 / trad.m3) * 100 : null,
      pest: { calN, calHa, planN, planHa, avoidedN: calN - planN, avoidedHa, chemHa },
      till: { passes, savedHa: tillSavedHa, savedH: tillRate ? tillSavedHa / tillRate : null },
      money,
      area,
      checks: check(f, cfg).issues,
    };
  }

  function weekNeeds(id: string, cfg: PlanConfig): WeekNeed[] {
    const f = env.farm(id);
    const mod = env.model(id);
    const out: WeekNeed[] = [];
    if (!f || !mod || !mod.paddies.length) return out;
    const water = cfg.water !== 'rainfed' ? simFarm(id, cfg.water) : null;
    if (water) {
      const need = water.per.filter((x) => x.firstNeed);
      if (need.length) {
        out.push({
          kind: 'pump',
          action: 'Flood to +5 cm',
          paddyIds: need.map((x) => x.id),
          why: `plan "${optionOf('water', cfg.water)?.name ?? cfg.water}" re-floods ${need.map((x) => `${x.id} on ${(x.firstNeed ?? '').slice(5)}`).join(', ')}`,
        });
      }
    }
    if (cfg.protect === 'calendar') {
      const due = mod.paddies.filter((pm) => costs.calendarDays.some((d) => d >= pm.day && d < pm.day + 7));
      if (due.length) out.push({ kind: 'drone', action: 'Spot-spray', paddyIds: due.map((x) => x.id), why: 'calendar spray day due (blanket)' });
    } else {
      const since = now() - 7 * DAY;
      const unscouted = mod.paddies.filter((pm) => !env.log.scouts(f, pm.id).some((x) => x.at >= since));
      if (unscouted.length) out.push({ kind: 'robot', action: 'Pest trap check', paddyIds: unscouted.map((x) => x.id), why: 'IPM: no scouting count in 7 days' });
    }
    return out;
  }

  function scheduleWeek(ids: readonly string[]) {
    const groups: Record<string, { kind: MachineKind; action: string; targets: PlanTarget[] }> = {};
    ids.forEach((id) =>
      weekNeeds(id, get(id).active).forEach((need) => {
        const key = `${need.kind}|${need.action}`;
        (groups[key] ??= { kind: need.kind, action: need.action, targets: [] }).targets.push({ farmId: id, paddyIds: need.paddyIds });
      }),
    );
    const tasks: T[] = [];
    const skipped: SkippedItem[] = [];
    Object.values(groups).forEach((g) => {
      const result = env.schedule({ kind: g.kind, action: g.action, targets: g.targets, text: 'Practice plan' });
      tasks.push(...result.tasks);
      skipped.push(...result.skipped);
    });
    return { tasks, skipped, groups: Object.values(groups) };
  }

  function setBelowK(k: number): number {
    belowK = k;
    cache = new WeakMap();
    return belowK;
  }

  return {
    get,
    seedPlans,
    check,
    setDraft,
    applyTemplate,
    approve,
    discard,
    simFarm,
    outcome,
    weekNeeds,
    scheduleWeek,
    costs: (): PlanCosts => costs,
    setCosts,
    resetCosts,
    setBelowK,
    version: () => version,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export type Plans<T = unknown> = ReturnType<typeof createPlans<T>>;
