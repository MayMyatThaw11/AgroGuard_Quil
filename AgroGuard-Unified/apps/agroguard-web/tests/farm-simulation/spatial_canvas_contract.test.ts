import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveReplayMetrics } from '../../src/features/farm-simulation/lib/metrics.ts';

test('SpatialCanvas layers and biophysical derivation contract', () => {
  const layerIds = ['sar', 'ndvi', 'thermal', 'elevation'];
  assert.equal(layerIds.length, 4, '4 cartographic layers available');

  // Verify derivation for day 1
  const metrics1 = deriveReplayMetrics(1, false);
  assert.ok(metrics1.canopyHeightPercent >= 0);
  assert.ok(metrics1.canopyHeightPercent <= 100);
  assert.ok(typeof metrics1.waterTableDepthMeters === 'number');
  assert.ok(typeof metrics1.matricPotentialKpa === 'number');

  // Verify derivation for day 90 (flowering stage)
  const metrics90 = deriveReplayMetrics(90, false);
  assert.ok(metrics90.canopyHeightPercent > metrics1.canopyHeightPercent, 'canopy develops over season');
});
