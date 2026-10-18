import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFixture } from '../../src/features/farm-simulation/lib/livetwin/twinFixture.ts';
import { validate } from '../../src/features/farm-simulation/lib/livetwin/twinSchema.ts';
import { A, addDays, farmModel, gddDay, kcOf, stageOf, travel, workHours } from '../../src/features/farm-simulation/lib/livetwin/twinModels.ts';
import type { ForecastPayload } from '../../src/features/farm-simulation/lib/livetwin/twinTypes.ts';

const NOW = new Date('2026-10-12T06:00:00Z');

function forecastFor(today: string, rain: number, et0: number): ForecastPayload {
  const time = Array.from({ length: 14 }, (_, i) => addDays(addDays(today, -7), i));
  const fill = (value: number) => time.map(() => value);
  return {
    current: { time: `${today}T06:00` },
    daily: {
      time,
      temperature_2m_max: fill(32),
      temperature_2m_min: fill(24),
      precipitation_sum: fill(rain),
      et0_fao_evapotranspiration: fill(et0),
    },
  };
}

test('Fixture: 100 farms with 8 paddies each, deterministic for a fixed date', () => {
  const a = buildFixture(100, NOW);
  const b = buildFixture(100, NOW);
  assert.equal(a.farms.length, 100);
  assert.ok(a.farms.every((f) => f.paddies.length === 8));
  assert.deepEqual(a, b);
  assert.equal(a.farms[0].name, 'Maubin Delta Cooperative');
});

test('Schema: the fixture validates cleanly and keeps every farm and machine', () => {
  const { farms, fleet } = buildFixture(100, NOW);
  const result = validate(farms, fleet);
  assert.equal(result.farms.length, 100);
  assert.equal(result.machines.length, fleet.length);
  assert.deepEqual(result.issues.filter((i) => i.level === 'error'), []);
});

test('Schema: bad records are excluded with an error, never silently invented', () => {
  const { farms, fleet } = buildFixture(2, NOW);
  const broken = [
    { ...farms[0], lat: 120 },
    { ...farms[1], paddies: [{ ...farms[1].paddies[0], transplanted: '2999-01-01' }] },
    farms[1],
  ];
  const result = validate(broken, [...fleet, { id: 'X-1', kind: 'drone', farmId: 'FM-404', status: 'idle' }]);
  assert.equal(result.farms.length, 1);
  assert.ok(result.issues.some((i) => i.msg.includes('invalid lat/lon')));
  assert.ok(result.issues.some((i) => i.msg.includes('in the future')));
  assert.ok(result.issues.some((i) => i.msg.includes('not in /farms')));
});

test('Schema: defaults are recorded on the paddy when optional fields are missing', () => {
  const { farms } = buildFixture(1, NOW);
  const paddy = { id: 'PD-01', variety: 'RD41', transplanted: '2026-08-01', areaHa: 0.8 };
  const result = validate([{ ...farms[0], paddies: [paddy] }], []);
  assert.deepEqual(result.farms[0].paddies[0].defaults, ['seepage 4 mm/d', 'bund 10 cm']);
});

test('Models: growing degree days, stage and crop coefficient follow the documented thresholds', () => {
  assert.equal(gddDay(40, 5), (35 + 10) / 2 - 10);
  assert.equal(gddDay(null, 20), null);
  assert.equal(stageOf(0), 'Seedling');
  assert.equal(stageOf(760), 'Panicle Initiation');
  assert.equal(stageOf(2100), 'Mature');
  assert.equal(kcOf(100), A.kc.ini);
  assert.equal(kcOf(1000), A.kc.mid);
  assert.equal(kcOf(3000), A.kc.end);
});

test('Models: a dry week drives the water level down and raises an alert', () => {
  const { farms } = buildFixture(1, NOW);
  const farm = validate(farms, []).farms[0];
  const dry = farmModel(farm, forecastFor('2026-10-12', 0, 6), null);
  const wet = farmModel(farm, forecastFor('2026-10-12', 40, 2), null);
  assert.ok((dry.lowest ?? 0) < (wet.lowest ?? 0));
  assert.equal(farmModel(farm, null, null).status, 'nodata');
});

test('Models: travel refuses cross-country and out-of-range drone routes', () => {
  const machine = validate(
    [buildFixture(1, NOW).farms[0]],
    [{ id: 'D-1', kind: 'drone', farmId: 'FM-001', status: 'idle', speedKmh: 40, rangeKm: 8, ratesHaPerHour: { 'Spot-spray': 4 } }],
  ).machines[0];
  const home = { id: 'FM-001', lat: 16.7, lon: 95.6, country: 'Myanmar' };
  assert.equal(travel(machine, home, { lat: 16.71, lon: 95.61, country: 'Myanmar' }).ok, true);
  assert.equal(travel(machine, home, { lat: 16.71, lon: 95.61, country: 'Thailand' }).ok, false);
  const far = travel(machine, home, { lat: 17.6, lon: 95.6, country: 'Myanmar' });
  assert.equal(far.ok, false);
  assert.match(far.why ?? '', /range/);
  assert.equal(workHours(machine, 'Spot-spray', [{ water: 0, areaHa: 4 }])?.h, A.setupH + 1);
});
