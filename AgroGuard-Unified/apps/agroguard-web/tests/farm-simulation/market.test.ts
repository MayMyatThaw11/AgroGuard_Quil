import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barWidth, outlookTone, pickupStep, produceForCrop, sortByDistance, viss } from '../../src/features/farm-simulation/lib/farmmap/market.ts';

test('Market: each outlook level has a tone and a word, never colour alone', () => {
  assert.equal(outlookTone('short'), 'ok');
  assert.equal(outlookTone('balanced'), 'info');
  assert.equal(outlookTone('glut'), 'risk');
  assert.equal(outlookTone('no-buyers'), 'watch');
  assert.equal(outlookTone('no-data'), 'info');
});

test('Market: vegetable farms can sell tomato, onion and chili', () => {
  const veg = produceForCrop('veg');
  for (const p of ['tomato', 'onion', 'chili', 'vegetables']) assert.ok(veg.includes(p as never), p);
  assert.deepEqual(produceForCrop('rice'), ['rice']);
});

test('Market: the pickup timeline advances one step every 40 seconds and stops at delivered', () => {
  const start = Date.parse('2026-10-30T10:00:00Z');
  assert.equal(pickupStep('2026-10-30T10:00:00Z', start), 0);
  assert.equal(pickupStep('2026-10-30T10:00:00Z', start + 85_000), 2);
  assert.equal(pickupStep('2026-10-30T10:00:00Z', start + 3_600_000), 4);
});

test('Market: bars share one scale and a small non-zero amount stays visible', () => {
  assert.equal(barWidth(50, 100), 50);
  assert.equal(barWidth(100, 100), 100);
  assert.equal(barWidth(0, 100), 0);
  assert.equal(barWidth(1, 10000), 2);
  assert.equal(barWidth(5, 0), 0);
});

test('Market: viss is 1.63293 kg', () => {
  assert.equal(viss(1632.93), 1000);
});

test('Market: buyers are listed nearest first, unknown distance last', () => {
  const rows = [{ id: 'a', km: 30 }, { id: 'b' }, { id: 'c', km: 4 }];
  assert.deepEqual(sortByDistance(rows).map((r) => r.id), ['c', 'a', 'b']);
});

test('Market: direct buyers within 50 km, bulk buyers within 300 km', async () => {
  const { withinReach } = await import('../../src/features/farm-simulation/lib/farmmap/market.ts');
  const rows = [{ id: 'near', km: 12 }, { id: 'mid', km: 120 }, { id: 'far', km: 378 }, { id: 'unknown' }];
  assert.deepEqual(withinReach(rows, 'direct').map((r) => r.id), ['near', 'unknown']);
  assert.deepEqual(withinReach(rows, 'bulk').map((r) => r.id), ['near', 'mid', 'unknown']);
});

test('Market: households and shops order in kg, bulk buyers in steps of 100 kg', async () => {
  const { kgStep } = await import('../../src/features/farm-simulation/lib/farmmap/market.ts');
  assert.equal(kgStep('household'), 1);
  assert.equal(kgStep('retail'), 1);
  assert.equal(kgStep('factory'), 100);
  assert.equal(kgStep(null), 100);
});
