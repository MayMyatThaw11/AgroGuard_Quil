import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGrowthStage, SEASON_DAYS } from '../../src/features/farm-simulation/lib/metrics.ts';

test('BottomDock metrics: validates growth stages and day limits', () => {
  assert.equal(SEASON_DAYS, 120);
  assert.ok(getGrowthStage(1).length > 0);
  assert.ok(getGrowthStage(60).length > 0);
  assert.ok(getGrowthStage(120).length > 0);
});
