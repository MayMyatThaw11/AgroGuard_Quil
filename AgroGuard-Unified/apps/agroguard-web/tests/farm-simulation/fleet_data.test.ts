import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lcg } from '../../src/features/farm-simulation/data/fleet/lcg.ts';
import {
  FARM_REGION_ORDER,
  generateFarm,
  getFarm,
  listFarms,
  parseFarmNumber,
  stageForDay,
} from '../../src/features/farm-simulation/data/fleet/farmGenerator.ts';
import { FLEET_CROPS, FLEET_REGIONS, FLEET_STAGES, buildFleet } from '../../src/features/farm-simulation/data/fleet/fleetFields.ts';

test('Fleet data: the LCG is deterministic and stays inside the unit interval', () => {
  const a = lcg(42);
  const b = lcg(42);
  for (let i = 0; i < 200; i += 1) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
  assert.notEqual(lcg(1)(), lcg(2)());
});

test('Fleet data: the fleet holds 3,600 fields split across five regions', () => {
  const fleet = buildFleet();
  assert.equal(fleet.fields.length, 3600);
  for (const region of FLEET_REGIONS) {
    assert.equal(fleet.fields.filter((field) => field.regionCode === region.code).length, region.count);
  }
  assert.equal(fleet.regions.length, 5);
  assert.deepEqual([...fleet.crops], [...FLEET_CROPS]);
});

test('Fleet data: field ids are unique and follow the region-code pattern', () => {
  const fleet = buildFleet();
  assert.equal(new Set(fleet.fields.map((field) => field.id)).size, fleet.fields.length);
  for (const field of fleet.fields) assert.match(field.id, /^(AY|BG|SG|MD|YG)-\d{4}$/);
});

test('Fleet data: every field value is physically bounded and consistent', () => {
  const fleet = buildFleet();
  for (const field of fleet.fields) {
    assert.ok(FLEET_STAGES.includes(field.stage), field.id);
    assert.ok(FLEET_CROPS.includes(field.crop), field.id);
    assert.ok(field.low < field.water, `${field.id} lowest ahead sits below water now`);
    assert.ok(field.ndvi >= 0.42 && field.ndvi <= 0.82, field.id);
    assert.ok(field.area >= 0.5 && field.area <= 1.1, field.id);
    assert.ok(field.day >= 18 && field.day < 116, field.id);
    assert.ok(Number.isFinite(field.water) && Math.abs(field.water) < 40, field.id);
    assert.equal(typeof field.offline, 'boolean');
  }
});

test('Fleet data: the fleet is reproducible and has cooperatives', () => {
  const first = buildFleet();
  const second = buildFleet();
  assert.deepEqual(first.fields[100], second.fields[100]);
  assert.deepEqual(first.fields[3599], second.fields[3599]);
  assert.ok(first.coopCount > 50);
  assert.ok(first.fields.some((field) => field.offline));
  assert.ok(first.fields.some((field) => !field.offline));
});

test('Farm generator: ids parse from text and reject non-farm ids', () => {
  assert.equal(parseFarmNumber('FM-042'), 42);
  assert.equal(parseFarmNumber('42'), 42);
  assert.equal(parseFarmNumber('FM-000'), null);
  assert.equal(parseFarmNumber('nonsense'), null);
  assert.equal(getFarm('nonsense'), null);
});

test('Farm generator: each farm has eight bounded paddies and a stable identity', () => {
  const farm = generateFarm(42);
  assert.equal(farm.id, 'FM-042');
  assert.equal(farm.n, 42);
  assert.deepEqual(
    farm.paddies.map((paddy) => paddy.id),
    ['PD-01', 'PD-02', 'PD-03', 'PD-04', 'PD-05', 'PD-06', 'PD-07', 'PD-08']
  );
  assert.ok(FARM_REGION_ORDER.includes(farm.region as (typeof FARM_REGION_ORDER)[number]));
  assert.equal(farm.assetStatus.length, 7);
  const area = farm.paddies.reduce((sum, paddy) => sum + paddy.area, 0);
  assert.ok(Math.abs(area - farm.area) < 1e-9);
  for (const paddy of farm.paddies) {
    assert.ok(paddy.low < paddy.water);
    assert.ok(paddy.ndvi >= 0.5 && paddy.ndvi <= 0.8);
    assert.ok(paddy.area >= 0.65 && paddy.area <= 0.9);
  }
  assert.deepEqual(generateFarm(42), farm);
});

test('Farm generator: stage follows crop day', () => {
  assert.equal(stageForDay(10), 'Seedling');
  assert.equal(stageForDay(40), 'Tillering');
  assert.equal(stageForDay(60), 'Panicle Initiation');
  assert.equal(stageForDay(75), 'Booting');
  assert.equal(stageForDay(90), 'Heading');
  assert.equal(stageForDay(110), 'Ripening');
});

test('Farm generator: lists are cached, unique and weighted toward Ayeyarwady', () => {
  const farms = listFarms(500);
  assert.equal(farms.length, 500);
  assert.equal(new Set(farms.map((farm) => farm.id)).size, 500);
  assert.equal(getFarm('FM-007'), getFarm(7));
  const ayeyarwady = farms.filter((farm) => farm.region === 'Ayeyarwady').length / 500;
  assert.ok(ayeyarwady > 0.3 && ayeyarwady < 0.5, `Ayeyarwady share ${ayeyarwady}`);
  assert.ok(farms.some((farm) => farm.offline));
});
