import type { Advice } from './twinIpm.ts';
import { rank, type IpmContext } from './twinIpm.ts';
import type { IpmLog } from './twinIpm.ts';
import { A, addDays, type FarmModel } from './twinModels.ts';
import type { CheckResult, PlanRecord } from './twinPlans.ts';
import type { Farm, MachineKind, PlanConfig } from './twinTypes.ts';
import type { WeatherNow } from './twinWeather.ts';

export type AgentId = 'water' | 'scout' | 'protect' | 'harvest' | 'auditor';
export type Severity = 'act' | 'watch' | 'info';
export type ProposalStatus = 'open' | 'approved' | 'rejected';

export interface AgentSpec {
  id: AgentId;
  name: string;
  role: string;
  tools: readonly string[];
  everyHours: number;
}

export const AGENTS: readonly AgentSpec[] = [
  { id: 'water', name: 'Water steward', role: 'Reads each paddy’s water series and 7-day forecast; proposes re-floods before the AWD line is crossed.', tools: ['water_balance_model', 'open_meteo_forecast', 'awd_rule'], everyHours: 6 },
  { id: 'scout', name: 'Pest scout', role: 'Finds paddies at high pest risk with no count in 10 days; proposes robot trap checks.', tools: ['ipm_risk_model', 'scouting_log'], everyHours: 12 },
  { id: 'protect', name: 'Protection advisor', role: 'Turns counts above threshold into the best-ranked control, holding sprays when the window is closed.', tools: ['ipm_decision', 'control_ranking', 'spray_window'], everyHours: 6 },
  { id: 'harvest', name: 'Harvest planner', role: 'Follows degree days to maturity; proposes hauling when paddies are mature.', tools: ['gdd_stage_model', 'open_meteo_forecast'], everyHours: 24 },
  { id: 'auditor', name: 'Plan auditor', role: 'Re-checks each active practice plan against the farm’s status, soil and site.', tools: ['plan_checks', 'site_gis'], everyHours: 24 },
];

export const AGENT_BY_ID: Readonly<Record<AgentId, AgentSpec>> = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentSpec>;

export interface Evidence {
  label: string;
  value: string;
  source: string;
}

export interface ProposalTask {
  kind: MachineKind;
  action: string;
}

export interface Finding {
  key: string;
  agent: AgentId;
  farmId: string;
  paddyIds: string[];
  title: string;
  why: string;
  severity: Severity;
  task: ProposalTask | null;
  evidence: Evidence[];
}

export interface Proposal extends Finding {
  id: string;
  at: number;
  status: ProposalStatus;
  decidedAt?: number;
  decidedBy?: string;
  note?: string;
}

export interface AgentRun {
  at: number;
  agent: AgentId;
  farms: number;
  tools: readonly string[];
  findings: number;
  ms: number;
}

export interface AgentEnv {
  farms: () => readonly Farm[];
  model: (farmId: string) => FarmModel | undefined;
  weather: (farmId: string) => WeatherNow | null;
  advice: (farmId: string, paddyId: string) => Advice | null;
  plan: (farmId: string) => PlanRecord;
  check: (farm: Farm, cfg: PlanConfig) => CheckResult;
  log: IpmLog;
}

const STRESS_RAIN_MM = 15;
const ACT_WITHIN_DAYS = 2;
const HARVEST_SOON_DAYS = 3;
const SOURCE = { model: 'Water balance model on Open-Meteo', ipm: 'IPM risk model (weather + stage)', gdd: 'Degree-day stage model', plan: 'Practice plan checks', weather: 'Open-Meteo' };
const cm = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} cm`;

function water(env: AgentEnv): Finding[] {
  const out: Finding[] = [];
  env.farms().forEach((farm) => {
    const model = env.model(farm.id);
    if (!model?.today || !model.paddies.length) return;
    const rain = model.rain72h ?? 0;
    const due = model.paddies
      .filter((p) => !/Ripening|Mature/.test(p.stage))
      .map((p) => ({ p, day: p.forecast.findIndex((w) => w <= A.awdTrigger) }))
      .filter((x) => x.day >= 0);
    if (!due.length) return;
    const first = Math.min(...due.map((x) => x.day));
    const ids = due.map((x) => x.p.id);
    const lowest = Math.min(...due.map((x) => x.p.low));
    const evidence: Evidence[] = [
      { label: 'Paddies crossing −15 cm', value: ids.join(', '), source: SOURCE.model },
      { label: 'First crossing', value: addDays(model.today, first), source: SOURCE.model },
      { label: 'Lowest ahead', value: cm(lowest), source: SOURCE.model },
      { label: 'Rain next 72 h', value: `${rain.toFixed(1)} mm`, source: SOURCE.weather },
    ];
    if (rain >= STRESS_RAIN_MM) {
      out.push({ key: `water|${farm.id}|wait`, agent: 'water', farmId: farm.id, paddyIds: ids, title: 'Rain due, re-flood can wait', why: `${rain.toFixed(0)} mm is forecast in 72 h, enough to lift the water before the AWD line.`, severity: 'info', task: null, evidence });
      return;
    }
    out.push({
      key: `water|${farm.id}|flood`,
      agent: 'water',
      farmId: farm.id,
      paddyIds: ids,
      title: `Re-flood ${ids.length} ${ids.length === 1 ? 'paddy' : 'paddies'} to +5 cm`,
      why: `${ids.length === 1 ? 'This paddy crosses' : 'These paddies cross'} the −15 cm AWD line ${first === 0 ? 'today' : `in ${first} day${first === 1 ? '' : 's'}`} with little rain due.`,
      severity: first <= ACT_WITHIN_DAYS ? 'act' : 'watch',
      task: { kind: 'pump', action: 'Flood to +5 cm' },
      evidence,
    });
  });
  return out;
}

function scout(env: AgentEnv): Finding[] {
  const out: Finding[] = [];
  env.farms().forEach((farm) => {
    const model = env.model(farm.id);
    if (!model?.paddies.length) return;
    const hits: { id: string; pest: string; why: string[] }[] = [];
    model.paddies.forEach((p) => {
      env.advice(farm.id, p.id)?.list.forEach((x) => {
        if (x.d.code === 'scout' && x.d.rk.level === 'high') hits.push({ id: p.id, pest: x.p.name, why: x.d.rk.why });
      });
    });
    if (!hits.length) return;
    const ids = [...new Set(hits.map((h) => h.id))];
    out.push({
      key: `scout|${farm.id}`,
      agent: 'scout',
      farmId: farm.id,
      paddyIds: ids,
      title: `Check traps on ${ids.length} high-risk ${ids.length === 1 ? 'paddy' : 'paddies'}`,
      why: 'Risk is high from weather and stage, and nobody has counted in 10 days. Only a count can justify treatment.',
      severity: 'watch',
      task: { kind: 'robot', action: 'Pest trap check' },
      evidence: [
        { label: 'Pests at high risk', value: [...new Set(hits.map((h) => h.pest))].join(', '), source: SOURCE.ipm },
        { label: 'Drivers', value: [...new Set(hits.flatMap((h) => h.why))].slice(0, 4).join(' · ') || '—', source: SOURCE.ipm },
        { label: 'Counts in 10 days', value: 'none', source: 'Crew scouting log' },
      ],
    });
  });
  return out;
}

function protect(env: AgentEnv): Finding[] {
  const out: Finding[] = [];
  env.farms().forEach((farm) => {
    const model = env.model(farm.id);
    if (!model?.paddies.length) return;
    model.paddies.forEach((p) => {
      const advice = env.advice(farm.id, p.id);
      advice?.list.forEach((x) => {
        if (x.d.code !== 'act' || !x.d.rec) return;
        const best = rank(advice.c as IpmContext, x.id, env.log).options[0];
        const evidence: Evidence[] = [
          { label: 'Count', value: `${x.d.rec.count} ${x.p.unit} (threshold ${x.p.threshold})`, source: 'Crew scouting log' },
          { label: 'Risk', value: `${x.d.rk.level} · ${Math.round(x.d.rk.r * 100)}`, source: SOURCE.ipm },
        ];
        if (best) evidence.push({ label: 'Best match', value: `${best.c.name} · score ${best.score}`, source: 'Control ranking (IRRI, FAO IPM, IRAC/FRAC reference values, TO VERIFY)' });
        out.push({
          key: `protect|${farm.id}|${p.id}|${x.id}`,
          agent: 'protect',
          farmId: farm.id,
          paddyIds: [p.id],
          title: best ? `${x.p.name}: ${best.c.name}` : `${x.p.name} above threshold`,
          why: best?.hold ? `Spray window closed (${best.hold}); hold and re-check.` : x.d.msg,
          severity: best?.hold ? 'watch' : 'act',
          task: best?.c.task && !best.hold ? { kind: best.c.task.kind, action: best.c.task.action } : null,
          evidence,
        });
      });
    });
  });
  return out;
}

function harvest(env: AgentEnv): Finding[] {
  const out: Finding[] = [];
  env.farms().forEach((farm) => {
    const model = env.model(farm.id);
    if (!model?.paddies.length) return;
    const mature = model.paddies.filter((p) => p.stage === 'Mature');
    const soon = model.paddies.filter((p) => p.stage !== 'Mature' && p.harvestIn != null && p.harvestIn <= HARVEST_SOON_DAYS);
    if (mature.length) {
      out.push({
        key: `harvest|${farm.id}|haul`,
        agent: 'harvest',
        farmId: farm.id,
        paddyIds: mature.map((p) => p.id),
        title: `Haul ${mature.length} mature ${mature.length === 1 ? 'paddy' : 'paddies'}`,
        why: 'Degree days have reached maturity (2,050 °C·d, generic 120-day indica).',
        severity: 'act',
        task: { kind: 'tractor', action: 'Haul harvest' },
        evidence: [
          { label: 'Mature', value: mature.map((p) => `${p.id} (${p.gdd.toLocaleString('en-US')} °C·d)`).join(', '), source: SOURCE.gdd },
          { label: 'Rain next 72 h', value: `${(model.rain72h ?? 0).toFixed(1)} mm`, source: SOURCE.weather },
        ],
      });
    }
    if (soon.length) {
      out.push({
        key: `harvest|${farm.id}|soon`,
        agent: 'harvest',
        farmId: farm.id,
        paddyIds: soon.map((p) => p.id),
        title: `Harvest due in ${Math.min(...soon.map((p) => p.harvestIn ?? 0))} days`,
        why: 'Drain 10–14 days before harvest and book a tractor; no machine work yet.',
        severity: 'info',
        task: null,
        evidence: [{ label: 'Days to maturity', value: soon.map((p) => `${p.id} ~${p.harvestIn} d`).join(', '), source: SOURCE.gdd }],
      });
    }
  });
  return out;
}

function auditor(env: AgentEnv): Finding[] {
  const out: Finding[] = [];
  env.farms().forEach((farm) => {
    const issues = env.check(farm, env.plan(farm.id).active).issues.filter((i) => i.level === 'block' || i.level === 'warn');
    if (!issues.length) return;
    out.push({
      key: `auditor|${farm.id}`,
      agent: 'auditor',
      farmId: farm.id,
      paddyIds: [],
      title: `${issues.length} plan ${issues.length === 1 ? 'conflict' : 'conflicts'} to review`,
      why: issues[0].msg,
      severity: issues.some((i) => i.level === 'block') ? 'act' : 'info',
      task: null,
      evidence: issues.map((i) => ({ label: i.level === 'block' ? 'Blocks' : 'Warns', value: i.msg, source: SOURCE.plan })),
    });
  });
  return out;
}

const RUNNERS: Record<AgentId, (env: AgentEnv) => Finding[]> = { water, scout, protect, harvest, auditor };

export function runAgent(id: AgentId, env: AgentEnv): Finding[] {
  return RUNNERS[id](env);
}

const MAX_PROPOSALS = 400;
const MAX_RUNS = 60;
const HOUR = 3600000;

export function createAgentRunner(env: AgentEnv, clock: () => number) {
  const enabled: Record<AgentId, boolean> = { water: true, scout: true, protect: true, harvest: true, auditor: true };
  const lastRun: Partial<Record<AgentId, number>> = {};
  let auto = true;
  let proposals: Proposal[] = [];
  let runs: AgentRun[] = [];
  let seq = 0;
  let version = 0;
  const listeners = new Set<() => void>();
  const emit = () => {
    version += 1;
    listeners.forEach((fn) => fn());
  };

  function run(id: AgentId): AgentRun {
    const started = Date.now();
    const at = clock();
    const findings = runAgent(id, env);
    const live = new Set(findings.map((f) => f.key));
    proposals = proposals.filter((p) => p.agent !== id || p.status !== 'open' || live.has(p.key));
    findings.forEach((finding) => {
      const open = proposals.find((p) => p.key === finding.key && p.status === 'open');
      if (open) Object.assign(open, finding, { at });
      else proposals.push({ ...finding, id: `AP-${(seq += 1).toString().padStart(5, '0')}`, at, status: 'open' });
    });
    proposals = proposals.slice(-MAX_PROPOSALS);
    lastRun[id] = at;
    const record: AgentRun = { at, agent: id, farms: env.farms().length, tools: AGENT_BY_ID[id].tools, findings: findings.length, ms: Date.now() - started };
    runs = [record, ...runs].slice(0, MAX_RUNS);
    return record;
  }

  function runDue(): AgentRun[] {
    const now = clock();
    const done = AGENTS.filter((a) => enabled[a.id] && (lastRun[a.id] === undefined || now - (lastRun[a.id] ?? 0) >= a.everyHours * HOUR)).map((a) => run(a.id));
    if (done.length) emit();
    return done;
  }

  function runAll(): AgentRun[] {
    const done = AGENTS.filter((a) => enabled[a.id]).map((a) => run(a.id));
    emit();
    return done;
  }

  function decide(id: string, status: Exclude<ProposalStatus, 'open'>, by: string, note?: string): Proposal | null {
    const proposal = proposals.find((p) => p.id === id);
    if (!proposal || proposal.status !== 'open') return null;
    if (!by.trim()) throw new Error('A named person must decide on agent proposals');
    Object.assign(proposal, { status, decidedAt: clock(), decidedBy: by, note });
    emit();
    return proposal;
  }

  function setAuto(on: boolean): void {
    auto = on;
    emit();
  }

  function setEnabled(id: AgentId, on: boolean): void {
    enabled[id] = on;
    emit();
  }

  return {
    run: (id: AgentId) => {
      const record = run(id);
      emit();
      return record;
    },
    runDue,
    runAll,
    decide,
    setEnabled,
    setAuto,
    auto: () => auto,
    enabled: (): Readonly<Record<AgentId, boolean>> => enabled,
    lastRun: (id: AgentId): number | undefined => lastRun[id],
    proposals: (): readonly Proposal[] => proposals,
    runs: (): readonly AgentRun[] => runs,
    version: () => version,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export type AgentRunner = ReturnType<typeof createAgentRunner>;
