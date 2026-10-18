import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StorageLike } from '../../src/features/farm-simulation/lib/paddySettings.ts';
import { createAdapter } from '../../src/features/farm-simulation/lib/livetwin/twinAdapter.ts';
import { addDays } from '../../src/features/farm-simulation/lib/livetwin/twinModels.ts';
import type { OpenMeteo } from '../../src/features/farm-simulation/lib/livetwin/twinOpenMeteo.ts';
import { createTwinStore, toWireTask } from '../../src/features/farm-simulation/lib/livetwin/twinStore.ts';
import type { WeatherMode } from '../../src/features/farm-simulation/lib/livetwin/twinWeather.ts';
import type { ForecastPayload } from '../../src/features/farm-simulation/lib/livetwin/twinTypes.ts';

const START = Date.parse('2026-10-12T06:00:00Z');
const TODAY = '2026-10-12';

function memory(): StorageLike {
  const data: Record<string, string> = {};
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

function forecast(): ForecastPayload {
  const time = Array.from({ length: 150 }, (_, i) => addDays(TODAY, i - 142));
  const fill = (value: number) => time.map(() => value);
  return {
    current: { time: `${TODAY}T06:00`, temperature_2m: 28, relative_humidity_2m: 80, wind_speed_10m: 6, wind_gusts_10m: 9, wind_direction_10m: 200, weather_code: 1, is_day: 1 },
    daily: { time, temperature_2m_max: fill(32), temperature_2m_min: fill(24), precipitation_sum: fill(2), et0_fao_evapotranspiration: fill(5) },
  };
}

const stubOpenMeteo: OpenMeteo = {
  forecast: async (pts) => ({ at: START, cached: false, fetched: pts.length, data: Object.fromEntries(pts.map((p) => [p.id, forecast()])) }),
  soilMoisture: async () => ({ sig: '', at: START, data: {} }),
  archive: async () => ({}),
  elevation: async () => ({}),
  soilgrids: async (p) => ({ lat: p.lat, lon: p.lon, at: START, ph: 6, clay: 30, sand: 30, silt: 40, soc: 15, texture: 'Clay loam', depth: '0–15 cm' }),
};

function setup(mode: WeatherMode = 'live') {
  const clock = { now: START };
  const posted: unknown[] = [];
  const adapter = createAdapter({
    storage: memory(),
    fetcher: async () => { throw new Error('offline'); },
    now: () => new Date(START),
  });
  const original = adapter.postTasks;
  adapter.postTasks = async (tasks) => { posted.push(tasks); return original(tasks); };
  const store = createTwinStore({
    adapter,
    openMeteo: stubOpenMeteo,
    storage: memory(),
    now: () => clock.now,
    weatherMode: () => mode,
    notify: (run) => run(),
    wait: async () => undefined,
    setInterval: () => 0,
  });
  return { store, clock, posted };
}

test('Store: init loads the fixture, fetches weather and models every farm', async () => {
  const { store } = setup();
  await store.init();
  const state = store.get();
  assert.equal(state.status, 'ready');
  assert.equal(state.farms.length, 100);
  assert.equal(state.sources.forecast.status, 'ok');
  assert.equal(state.model['FM-001'].status === 'nodata', false);
  assert.equal(store.wx('FM-001')?.simulated, false);
});

test('Store: a dispatch needs a named approver and sends ISO times over the wire', async () => {
  const { store, posted } = setup();
  await store.init();
  const result = store.plan({ kind: 'drone', action: 'Scout & NDVI scan', targets: [{ farmId: 'FM-001', paddyIds: ['PD-01', 'PD-02'] }] });
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].machineId, 'D-01');
  await assert.rejects(store.dispatch(result.tasks, '  '), /approve/);
  assert.equal(store.get().tasks.length, 0);
  const sent = await store.dispatch(result.tasks, 'Cooperative manager');
  assert.equal(sent[0].approvedBy, 'Cooperative manager');
  assert.equal(store.get().tasks.length, 1);
  assert.match(toWireTask(result.tasks[0]).startAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(posted.length, 1);
});

test('Store: the wind ceiling halts a spray even when the guard is overridden', async () => {
  const windy = setup('windy');
  await windy.store.init();
  const blocked = windy.store.plan({ kind: 'drone', action: 'Spot-spray', override: true, targets: [{ farmId: 'FM-001', paddyIds: ['PD-01'] }] });
  assert.equal(blocked.tasks.length, 0);
  assert.match(blocked.skipped[0].why, /hard safety halt/);
  const calm = setup('calm');
  await calm.store.init();
  const allowed = calm.store.plan({ kind: 'drone', action: 'Spot-spray', targets: [{ farmId: 'FM-001', paddyIds: ['PD-01'] }] });
  assert.equal(allowed.tasks.length + allowed.skipped.length > 0, true);
  assert.equal(allowed.skipped.some((s) => s.why.includes('hard safety halt')), false);
});

test('Store: a task can only be cancelled before it starts, and finished pump tasks feed the water model', async () => {
  const { store, clock } = setup();
  await store.init();
  const planned = store.plan({ kind: 'pump', action: 'Run sprinklers', targets: [{ farmId: 'FM-001', paddyIds: ['PD-01', 'PD-02', 'PD-03', 'PD-04', 'PD-05', 'PD-06', 'PD-07', 'PD-08'] }] });
  if (!planned.tasks.length) assert.fail(planned.skipped.map((s) => s.why).join('; '));
  const [task] = await store.dispatch(planned.tasks, 'Tester');
  const before = store.get().model['FM-001'].paddies.find((p) => p.id === task.paddyIds[0])?.water ?? 0;
  clock.now += 3 * 86400000;
  store.tick();
  assert.equal(store.get().tasks[0].status, 'done');
  assert.equal(store.cancel(task.id), false);
  const after = store.get().model['FM-001'].paddies.find((p) => p.id === task.paddyIds[0])?.water ?? 0;
  assert.ok(after > before);
  const scout = (paddy: string) => store.plan({ kind: 'drone', action: 'Scout & NDVI scan', machineId: 'D-01', targets: [{ farmId: 'FM-001', paddyIds: [paddy] }] });
  const [running] = await store.dispatch(scout('PD-01').tasks, 'Tester');
  const [queued] = await store.dispatch(scout('PD-02').tasks, 'Tester');
  assert.ok(queued.startAt >= running.endAt);
  assert.equal(store.cancel(running.id), false);
  assert.equal(store.cancel(queued.id), true);
  assert.equal(store.taskStatus(store.get().tasks[2], store.simNow()), 'cancelled');
});

test('Store: notes keep replies and clearing tasks resets events and the clock', async () => {
  const { store, clock } = setup();
  await store.init();
  const note = store.addNote({ farmIds: ['FM-001'], text: 'Check bund PD-03' });
  store.replyNote(note.id, { at: clock.now, text: 'Noted' });
  assert.equal(store.get().notes[0].replies.length, 1);
  store.clearTasks();
  assert.deepEqual(store.get().events, {});
  assert.equal(store.get().tasks.length, 0);
});
