import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFarm, getFarm } from '../../src/features/farm-simulation/data/fleet/farmGenerator.ts';
import { farmToOpsFarm, mapFarmToOpsFarm, resolveOpsFarm } from '../../src/features/farm-simulation/data/fleet/farmToOps.ts';
import { getFarmMap } from '../../src/features/farm-simulation/lib/farmmap/farmMapData.ts';
import { OPS_FARM, buildHistory, todayUtc } from '../../src/features/farm-simulation/data/ops/fixture.ts';

test('Farm to Ops: converts a generated FleetFarm into a valid OpsFarm structure', () => {
  const fleetFarm = generateFarm(1);
  const opsFarm = farmToOpsFarm(fleetFarm);

  assert.equal(opsFarm.id, 'FM-001');
  assert.match(opsFarm.name, /Pathein|Paddy|Cooperative|Growers|Farm/);
  assert.equal(opsFarm.country, 'MM');
  assert.match(opsFarm.region, /Ayeyarwady/);
  assert.equal(opsFarm.paddies.length, 8);

  for (const paddy of opsFarm.paddies) {
    assert.match(paddy.id, /^PD-\d{2}$/);
    assert.ok(['Tillering', 'Panicle Initiation', 'Flowering', 'Ripening'].includes(paddy.stage));
    assert.ok(paddy.daysSincePlanting > 0);
    assert.ok(paddy.areaHa > 0);
    assert.ok(paddy.rect.w > 0 && paddy.rect.d > 0);
    assert.ok(paddy.ripeness >= 0 && paddy.ripeness <= 1);
  }

  assert.ok(opsFarm.assets.length >= 6);
  assert.ok(opsFarm.assets.some((a) => a.kind === 'drone'));
  assert.ok(opsFarm.assets.some((a) => a.kind === 'robot'));
  assert.ok(opsFarm.assets.some((a) => a.kind === 'tractor'));
});

test('Farm to Ops: history can be built for any converted fleet farm', () => {
  const fleetFarm = generateFarm(42);
  const opsFarm = farmToOpsFarm(fleetFarm);
  const start = todayUtc();
  const history = buildHistory(opsFarm, start, 20261010 + fleetFarm.n * 101);

  assert.equal(history.weather.length, 60);
  assert.equal(Object.keys(history.depthCm).length, 8);
  assert.equal(Object.keys(history.ndvi).length, 8);
});

test('Farm to Ops: resolveOpsFarm returns the demo farm, generated farms, and null for an unknown id', () => {
  assert.equal(resolveOpsFarm('farm_ayeyarwady_demo')?.id, OPS_FARM.id);
  assert.equal(resolveOpsFarm(null)?.id, OPS_FARM.id);
  assert.equal(resolveOpsFarm(undefined)?.id, OPS_FARM.id);
  assert.equal(resolveOpsFarm('FM-001')?.id, 'FM-001');
  assert.equal(resolveOpsFarm('FM-100')?.id, 'FM-100');
  assert.equal(resolveOpsFarm('invalid-id'), null);
});

test('Farm map to Ops: a selected rice farm opens as its own field twin with the same id, name and area', () => {
  const rice = getFarmMap().farms.filter((f) => f.crop === 'rice').slice(0, 25);
  assert.ok(rice.length > 0);
  for (const farm of rice) {
    const ops = resolveOpsFarm(farm.id);
    assert.ok(ops);
    assert.equal(ops.id, farm.id);
    assert.ok(ops.name.startsWith(farm.name));
    assert.equal(ops.paddies.length, 8);
    const total = ops.paddies.reduce((sum, p) => sum + p.areaHa, 0);
    assert.ok(Math.abs(total - farm.area) <= 0.08, `${farm.id}: ${total} vs ${farm.area}`);
    assert.equal(ops.standard, farm.organic ? 'ASEAN_ORGANIC_ASOA' : 'GAP_STANDARD');
  }
});

test('Farm map to Ops: crop farms have no paddy twin and resolve to nothing, never the demo farm', () => {
  const crop = getFarmMap().farms.find((f) => f.crop !== 'rice');
  assert.ok(crop);
  assert.equal(mapFarmToOpsFarm(crop), null);
  assert.equal(resolveOpsFarm(crop.id), null);
});
