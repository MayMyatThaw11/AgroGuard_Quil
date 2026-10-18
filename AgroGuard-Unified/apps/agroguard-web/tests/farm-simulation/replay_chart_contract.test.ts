import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveReplayMetrics, SEASON_DAYS } from '../../src/features/farm-simulation/lib/metrics.ts';

test('ReplayChart simulation metrics: computes 120-day trajectory', () => {
  assert.equal(SEASON_DAYS, 120, '120-day rice physiological cycle design target');

  // Verify initial day
  const day1 = deriveReplayMetrics(1, false);
  assert.equal(typeof day1.biomass, 'number');
  assert.equal(typeof day1.waterTableDepthMeters, 'number');
  assert.ok(day1.biomass >= 0);

  // Verify harvest day
  const day120 = deriveReplayMetrics(120, false);
  assert.ok(day120.biomass > day1.biomass, 'biomass accumulates toward harvest');

  // Verify AWD valve impact
  const day60Closed = deriveReplayMetrics(60, false);
  const day60Open = deriveReplayMetrics(60, true);
  assert.notEqual(day60Closed.waterTableDepthMeters, day60Open.waterTableDepthMeters, 'valve state modulates water table');
});
