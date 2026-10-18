import assert from 'node:assert/strict';
import test from 'node:test';
import { waterStatus } from '../../src/features/farm-simulation/lib/liveOps.ts';
import { fitWithin } from '../../src/features/farm-simulation/lib/photo.ts';

test('water status speaks plainly and never guesses an unknown level', () => {
  assert.equal(waterStatus(undefined, undefined, -15, 'Tillering').tone, 'unknown');
  assert.equal(waterStatus(null, [-10], -15, 'Tillering').label, 'Unknown: read the tube');
  assert.equal(waterStatus(-16, [-17], -15, 'Tillering').tone, 'act');
  assert.equal(waterStatus(-12, [-13, -15.2], -15, 'Tillering').tone, 'watch');
  assert.equal(waterStatus(-12, [-13, -14, -16], -15, 'Tillering').tone, 'ok');
  assert.equal(waterStatus(2, [1], 3, 'Flowering').tone, 'act');
  assert.equal(waterStatus(-20, [-21], -15, 'Ripening').tone, 'ok');
});

test('gauge photos are shrunk to a phone-friendly size without stretching', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1280, height: 960 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(1080, 2400), { width: 576, height: 1280 });
});
