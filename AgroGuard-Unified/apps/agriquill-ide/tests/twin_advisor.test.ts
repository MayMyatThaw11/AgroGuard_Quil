import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StorageLike } from '../src/lib/paddySettings.ts';
import { createAdapter } from '../src/lib/livetwin/twinAdapter.ts';
import { analyseSite, parseOverpass, slopeFromSamples } from '../src/lib/livetwin/twinGis.ts';
import { advise, buildContext, createIpmLog, decide, rank, sprayHold } from '../src/lib/livetwin/twinIpm.ts';
import { addDays, farmModel } from '../src/lib/livetwin/twinModels.ts';
import { createOpenMeteo, type JsonResponse } from '../src/lib/livetwin/twinOpenMeteo.ts';
import { createPerf } from '../src/lib/livetwin/twinPerf.ts';
import { createPlans, type PlanEnv } from '../src/lib/livetwin/twinPlans.ts';
import { presetWeather, liveWeather } from '../src/lib/livetwin/twinWeather.ts';
import { validate } from '../src/lib/livetwin/twinSchema.ts';
import type { Farm, ForecastPayload } from '../src/lib/livetwin/twinTypes.ts';

function memory(): StorageLike {
  const data: Record<string, string> = {};
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

const ok = (body: unknown): JsonResponse => ({ ok: true, status: 200, json: async () => body });
const TODAY = '2026-10-12';

function farmWith(organic: boolean, ageDays: number): Farm {
  const planted = addDays(TODAY, -ageDays);
  const { farms } = validate(
    [{ id: 'FM-T', name: 'Test farm', region: 'Myanmar', lat: 16.7, lon: 95.6, organic, paddies: [{ id: 'PD-01', variety: 'Paw San', transplanted: planted, areaHa: 1, seepageMmDay: 4 }] }],
    [],
  );
  return farms[0];
}

function weather(rain: number, et0: number, from = -60, every = 1): ForecastPayload {
  const time = Array.from({ length: 70 }, (_, i) => addDays(TODAY, from + i));
  const fill = (value: number) => time.map(() => value);
  return {
    current: { time: `${TODAY}T06:00`, temperature_2m: 28, relative_humidity_2m: 85, wind_speed_10m: 9, wind_gusts_10m: 14, weather_code: 1, is_day: 1 },
    daily: { time, temperature_2m_max: fill(32), temperature_2m_min: fill(24), precipitation_sum: time.map((_, i) => (i % every === 0 ? rain : 0)), et0_fao_evapotranspiration: fill(et0) },
  };
}

function ipmContext(farm: Farm, log = createIpmLog(null)) {
  const fc = weather(2, 5);
  const model = farmModel(farm, fc, null);
  const w = liveWeather(fc.current);
  return { log, c: buildContext({ farm, model, weather: w, soil: null, soilMoisture: null, forecast: fc, plan: null, site: null, log }) };
}

test('Perf: auto mode steps down when frames overrun the budget and a manual mode is remembered', () => {
  const storage = memory();
  const perf = createPerf(storage);
  assert.equal(perf.tier(), 'balanced');
  perf.report('map', 80, 0);
  perf.report('map', 80, 2100);
  assert.equal(perf.tier(), 'saver');
  perf.setMode('high');
  assert.equal(createPerf(storage).tier(), 'high');
});

test('Adapter: fixture mode loads validated demo data and marks posted tasks as simulated', async () => {
  const adapter = createAdapter({ storage: memory(), fetcher: async () => { throw new Error('no network'); }, now: () => new Date('2026-10-12T00:00:00Z') });
  const data = await adapter.load();
  assert.equal(data.source, 'fixture');
  assert.equal(data.farms.length, 100);
  const posted = await adapter.postTasks([{ id: 'T1', machineId: 'D-01', farmId: 'FM-001', paddyIds: ['PD-01'], action: 'Spot-spray', startAt: 'a', arriveAt: 'b', endAt: 'c', status: 'planned' }]);
  assert.equal(posted[0].simulated, true);
  assert.equal(await adapter.pollTasks('2026-10-12T00:00:00Z'), null);
});

test('Adapter: api mode refuses to run without a base URL and surfaces HTTP failures', async () => {
  const storage = memory();
  const adapter = createAdapter({ storage, fetcher: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  adapter.configure({ mode: 'api' });
  await assert.rejects(adapter.load(), /no base URL/);
  adapter.configure({ baseUrl: 'http://127.0.0.1:8000/' });
  await assert.rejects(adapter.load(), /HTTP 503/);
  assert.equal(createAdapter({ storage, fetcher: async () => ok({}) }).config().baseUrl, 'http://127.0.0.1:8000/');
});

test('Open-Meteo: a second forecast call inside the cache window does not hit the network', async () => {
  let calls = 0;
  const api = createOpenMeteo({
    fetcher: async () => { calls += 1; return ok({ current: { time: `${TODAY}T06:00` }, daily: { time: [TODAY] }, elevation: 12 }); },
    storage: memory(),
    now: () => 1_000_000,
    sleep: async () => undefined,
  });
  const point = { id: 'FM-1', lat: 16.7, lon: 95.6 };
  const first = await api.forecast([point]);
  const second = await api.forecast([point]);
  assert.equal(calls, 1);
  assert.equal(first.fetched, 1);
  assert.equal(second.cached, true);
});

test('Open-Meteo: a 429 waits and retries, then reports the failure reason', async () => {
  const waits: number[] = [];
  let calls = 0;
  const api = createOpenMeteo({
    fetcher: async () => {
      calls += 1;
      return calls === 1 ? { ok: false, status: 429, json: async () => ({}) } : { ok: false, status: 400, json: async () => ({ reason: 'bad coordinates' }) };
    },
    storage: null,
    now: () => 0,
    sleep: async (ms) => { waits.push(ms); },
  });
  await assert.rejects(api.forecast([{ id: 'x', lat: 1, lon: 1 }]), /HTTP 400 · bad coordinates/);
  assert.deepEqual(waits, [62000]);
});

test('GIS: slope comes from the DEM samples and a protected area near the farm raises a warning', () => {
  const farm = { id: 'FM-1', lat: 16.7, lon: 95.6 };
  assert.equal(slopeFromSamples(farm, [10, 10, 10, 10, 10], 0).slopePct, 0);
  assert.equal(slopeFromSamples(farm, [10, 16, 10, 10, 10], 0).slopePct, 1);
  const site = parseOverpass(farm, { elements: [{ type: 'node', lat: 16.71, lon: 95.6, tags: { leisure: 'nature_reserve', name: 'Test Reserve' } }, { type: 'node', lat: 16.702, lon: 95.6, tags: { waterway: 'canal' } }] }, 0);
  const analysis = analyseSite({ site, slope: null, soil: null, elevation: 5, forecast: null, today: null });
  assert.equal(analysis.protectedNear, true);
  assert.ok(analysis.flags.some((f) => f.msg.includes('Test Reserve')));
  assert.ok(analysis.waterM != null && analysis.waterM < 300);
  assert.equal('fam' in analysis, false);
});

test('IPM: without a count the advice is to scout, above the threshold it is to act', () => {
  const farm = farmWith(false, 50);
  const { c, log } = ipmContext(farm);
  assert.equal(c.ok, true);
  assert.equal(decide(c, 'bph', log).code, 'scout');
  log.logScout({ farmId: farm.id, paddyId: 'PD-01', pest: 'bph', count: 3 });
  assert.equal(decide(c, 'bph', log).code, 'hold');
  log.logScout({ farmId: farm.id, paddyId: 'PD-01', pest: 'bph', count: 25, at: Date.now() + 1 });
  assert.equal(decide(c, 'bph', log).code, 'act');
  assert.equal(advise(c, log).list[0].d.code, 'act');
});

test('IPM: organic farms never get synthetic products and wind over the limit holds sprays', () => {
  const { c, log } = ipmContext(farmWith(true, 50));
  const ranking = rank(c, 'bph', log);
  assert.ok(ranking.options.length > 0);
  assert.ok(ranking.options.every((o) => o.c.organic));
  assert.ok(ranking.excluded.some((e) => e.c.id === 'pymetrozine' && e.why[0].includes('Organic')));
  assert.equal(sprayHold({ wind: 22, rainNow: 0 })?.includes('drift limit'), true);
  assert.equal(sprayHold({ wind: 5, rainNow: 2 })?.includes('raining'), true);
  assert.equal(sprayHold({ wind: 5, rainNow: 0 }), null);
  assert.equal(presetWeather('storm', 90).simulated, true);
});

test('Plans: organic farms are adjusted, blocked combinations are reported, approval promotes the draft', () => {
  const farm = farmWith(true, 40);
  const fc = weather(0, 5);
  const model = farmModel(farm, fc, null);
  const log = createIpmLog(null);
  const env: PlanEnv = {
    farm: (id) => (id === farm.id ? farm : undefined),
    model: () => model,
    forecast: () => fc,
    archive: () => undefined,
    soil: () => undefined,
    machines: () => [],
    site: () => null,
    log,
    schedule: () => ({ tasks: [], skipped: [], at: 0 }),
  };
  const plans = createPlans(env, memory());
  const adjusted = plans.check(farm, { water: 'awd', protect: 'calendar', nutrient: 'fixed', tillage: 'puddle', system: 'mono' });
  assert.equal(adjusted.cfg.protect, 'ipm');
  assert.equal(adjusted.cfg.nutrient, 'organic');
  assert.equal(adjusted.blocked, false);
  assert.equal(plans.check(farm, { water: 'rainfed', protect: 'ipm', nutrient: 'organic', tillage: 'puddle', system: 'ricefish' }).blocked, true);
  plans.setDraft(farm.id, { water: 'awdfc' });
  assert.equal(plans.get(farm.id).draft?.water, 'awdfc');
  plans.approve([farm.id], 'Tester');
  assert.equal(plans.get(farm.id).active.water, 'awdfc');
  assert.equal(plans.get(farm.id).draft, null);
  assert.equal(plans.get(farm.id).by, 'Tester');
});

test('Plans: Safe AWD pumps less than continuous flooding on the same weather, and money follows the saved water', () => {
  const farm = farmWith(false, 55);
  const fc = weather(30, 5, -60, 5);
  const model = farmModel(farm, fc, null);
  const env: PlanEnv = {
    farm: () => farm, model: () => model, forecast: () => fc, archive: () => undefined, soil: () => undefined,
    machines: () => [], site: () => null, log: createIpmLog(null), schedule: () => ({ tasks: [], skipped: [], at: 0 }),
  };
  const plans = createPlans(env, memory());
  const flood = plans.simFarm(farm.id, 'flood');
  const awd = plans.simFarm(farm.id, 'awd');
  assert.ok(flood && awd);
  assert.ok(awd.m3 < flood.m3);
  const out = plans.outcome(farm.id, { water: 'awd', protect: 'ipm', nutrient: 'fixed', tillage: 'mintill', system: 'mono' });
  assert.ok(out && out.savedM3 != null && out.savedM3 > 0);
  assert.equal(out.till.passes, 1);
  assert.ok(out.money.total >= out.money.water);
});
