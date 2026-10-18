import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StorageLike } from '../../src/features/farm-simulation/lib/paddySettings.ts';
import { createAgentRunner, runAgent, type AgentEnv } from '../../src/features/farm-simulation/lib/livetwin/twinAgents.ts';
import { advise, buildContext, createIpmLog } from '../../src/features/farm-simulation/lib/livetwin/twinIpm.ts';
import { addDays, farmModel, type FarmModel } from '../../src/features/farm-simulation/lib/livetwin/twinModels.ts';
import { createPlans } from '../../src/features/farm-simulation/lib/livetwin/twinPlans.ts';
import { validate } from '../../src/features/farm-simulation/lib/livetwin/twinSchema.ts';
import type { Farm, ForecastPayload } from '../../src/features/farm-simulation/lib/livetwin/twinTypes.ts';
import { liveWeather } from '../../src/features/farm-simulation/lib/livetwin/twinWeather.ts';

const TODAY = '2026-10-12';

function memory(): StorageLike {
  const data: Record<string, string> = {};
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

function farm(id: string, ageDays: number, organic = false): Farm {
  const planted = addDays(TODAY, -ageDays);
  return validate(
    [{ id, name: `Farm ${id}`, region: 'Myanmar', lat: 16.7, lon: 95.6, organic, paddies: [1, 2].map((n) => ({ id: `PD-0${n}`, variety: 'Paw San', transplanted: planted, areaHa: 1, seepageMmDay: 5 })) }],
    [],
  ).farms[0];
}

function weather(rain: number, et0: number, wind = 6): ForecastPayload {
  const time = Array.from({ length: 160 }, (_, i) => addDays(TODAY, i - 150));
  const fill = (v: number) => time.map(() => v);
  return {
    current: { time: `${TODAY}T06:00`, temperature_2m: 28, relative_humidity_2m: 85, wind_speed_10m: wind, wind_gusts_10m: wind + 4, weather_code: 1, is_day: 1 },
    daily: { time, temperature_2m_max: fill(32), temperature_2m_min: fill(24), precipitation_sum: fill(rain), et0_fao_evapotranspiration: fill(et0) },
  };
}

function env(farms: Farm[], fc: ForecastPayload, setup?: (log: ReturnType<typeof createIpmLog>) => void) {
  const log = createIpmLog(null);
  setup?.(log);
  const models: Record<string, FarmModel> = Object.fromEntries(farms.map((f) => [f.id, farmModel(f, fc, null)]));
  const plans = createPlans(
    { farm: (id) => farms.find((f) => f.id === id), model: (id) => models[id], forecast: () => fc, archive: () => undefined, soil: () => undefined, machines: () => [], site: () => null, log, schedule: () => ({ tasks: [], skipped: [], at: 0 }) },
    memory(),
  );
  const agentEnv: AgentEnv = {
    farms: () => farms,
    model: (id) => models[id],
    weather: () => liveWeather(fc.current),
    advice: (farmId, paddyId) => {
      const f = farms.find((x) => x.id === farmId);
      if (!f) return null;
      const c = buildContext({ farm: f, model: models[farmId], paddyId, weather: liveWeather(fc.current), soil: null, soilMoisture: null, forecast: fc, plan: plans.get(farmId).active, site: null, log });
      return advise(c, log);
    },
    plan: (id) => plans.get(id),
    check: (f, cfg) => plans.check(f, cfg),
    log,
  };
  return { agentEnv, plans, log };
}

test('Water steward: a dry forecast that crosses the AWD line proposes a re-flood with its evidence', () => {
  const { agentEnv } = env([farm('FM-1', 50)], weather(0, 6));
  const [finding] = runAgent('water', agentEnv);
  assert.ok(finding);
  assert.equal(finding.task?.action, 'Flood to +5 cm');
  assert.equal(finding.task?.kind, 'pump');
  assert.deepEqual(finding.paddyIds.sort(), ['PD-01', 'PD-02']);
  assert.ok(finding.evidence.some((e) => e.label === 'First crossing'));
});

test('Water steward: rain due within 72 h means wait, not pump', () => {
  const findings = Array.from({ length: 30 }, (_, i) => runAgent('water', env([farm('FM-1', 40 + i)], weather(6, 9)).agentEnv)).find((list) => list.length);
  assert.ok(findings, 'some transplant age crosses the AWD line in the forecast');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].task, null);
  assert.match(findings[0].title, /Rain due/);
});

test('Protection advisor: a count above threshold becomes a ranked control; organic farms never get synthetics', () => {
  const plain = env([farm('FM-1', 50)], weather(2, 4), (log) => log.logScout({ farmId: 'FM-1', paddyId: 'PD-01', pest: 'bph', count: 30, at: Date.now() }));
  const act = runAgent('protect', plain.agentEnv).find((f) => f.paddyIds[0] === 'PD-01');
  assert.ok(act);
  assert.match(act.title, /Brown planthopper/);
  const organic = env([farm('FM-2', 50, true)], weather(2, 4), (log) => log.logScout({ farmId: 'FM-2', paddyId: 'PD-01', pest: 'bph', count: 30, at: Date.now() }));
  const org = runAgent('protect', organic.agentEnv)[0];
  assert.ok(org);
  assert.doesNotMatch(org.title, /Pymetrozine|Dinotefuran|Buprofezin/);
});

test('Protection advisor: wind over the drift limit holds the spray and drops the task', () => {
  const windy = env([farm('FM-1', 50)], weather(2, 4, 30), (log) => log.logScout({ farmId: 'FM-1', paddyId: 'PD-01', pest: 'bph', count: 30, at: Date.now() }));
  const held = runAgent('protect', windy.agentEnv).find((f) => f.task === null && f.severity === 'watch');
  assert.ok(held);
  assert.match(held.why, /window closed/);
});

test('Harvest planner and plan auditor read stage and plan checks', () => {
  const ready = env([farm('FM-1', 140)], weather(1, 4));
  const haul = runAgent('harvest', ready.agentEnv).find((f) => f.task?.action === 'Haul harvest');
  assert.ok(haul);
  const checked = env([farm('FM-1', 50)], weather(1, 4));
  checked.plans.setDraft('FM-1', { system: 'ricefish', water: 'rainfed' });
  checked.plans.approve(['FM-1']);
  const [audit] = runAgent('auditor', checked.agentEnv);
  assert.ok(audit);
  assert.equal(audit.severity, 'act');
});

test('Runner: runs when due on the clock, keeps one open proposal per key and needs a named person to decide', () => {
  let now = Date.parse('2026-10-12T06:00:00Z');
  const { agentEnv } = env([farm('FM-1', 50)], weather(0, 6));
  const runner = createAgentRunner(agentEnv, () => now);
  assert.equal(runner.runDue().length, 5);
  assert.equal(runner.runDue().length, 0);
  const open = runner.proposals().filter((p) => p.agent === 'water');
  assert.equal(open.length, 1);
  now += 6 * 3600000;
  assert.ok(runner.runDue().some((r) => r.agent === 'water'));
  assert.equal(runner.proposals().filter((p) => p.agent === 'water').length, 1);
  assert.throws(() => runner.decide(open[0].id, 'approved', ' '), /named person/);
  assert.equal(runner.decide(open[0].id, 'approved', 'Tester')?.status, 'approved');
  assert.equal(runner.decide(open[0].id, 'rejected', 'Tester'), null);
  runner.setEnabled('water', false);
  now += 24 * 3600000;
  assert.equal(runner.runDue().some((r) => r.agent === 'water'), false);
});
