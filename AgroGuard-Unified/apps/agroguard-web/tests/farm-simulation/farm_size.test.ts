import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SMALL_FARM_MAX_HA, SMALL_MEDIUM_MAX_HA, farmSizeBand } from '../../src/features/farm-simulation/lib/farmmap/farmSize.ts';
import { getFarmMap } from '../../src/features/farm-simulation/lib/farmmap/farmMapData.ts';

test('Farm size: bands follow the 2 ha and 10 ha lines', () => {
  assert.equal(SMALL_FARM_MAX_HA, 2);
  assert.equal(SMALL_MEDIUM_MAX_HA, 10);
  assert.equal(farmSizeBand(1.9), 'small');
  assert.equal(farmSizeBand(2), 'small');
  assert.equal(farmSizeBand(2.1), 'small-medium');
  assert.equal(farmSizeBand(10), 'small-medium');
  assert.equal(farmSizeBand(10.01), 'too-large');
});

test('Farm size: every demo farm is small or small-medium', () => {
  const farms = getFarmMap().farms;
  assert.ok(farms.length > 0);
  for (const farm of farms) assert.ok(farm.area > 0 && farm.area <= SMALL_MEDIUM_MAX_HA, `${farm.id} is ${farm.area} ha`);
  assert.ok(farms.filter((f) => f.area <= SMALL_FARM_MAX_HA).length > farms.length / 3, 'most demo farms should be small');
});
