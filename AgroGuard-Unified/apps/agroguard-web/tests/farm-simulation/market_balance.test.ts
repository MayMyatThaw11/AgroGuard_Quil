import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYER_MAP, PLAIN_SOURCES, buildDataLayers } from '../../src/features/farm-simulation/lib/farmmap/dataLayersTheme.ts';
import { DEFAULT_LAYERS, LAYER_GROUPS } from '../../src/features/farm-simulation/lib/farmmap/farmMapLayerKeys.ts';
import { LEVEL_COLOR, balanceFeatures, ringRadius, type TownBalance } from '../../src/features/farm-simulation/lib/farmmap/marketBalance.ts';

const row = (extra: Partial<TownBalance>): TownBalance => ({ town: 'Hmawbi', level: 'glut', supply_kg: 5000, demand_kg: 1000, listings: 3, buyers: 1, lat: 17.1, lon: 96.05, ...extra });

test('ring radius grows with supply, is clamped, and never vanishes', () => {
  assert.ok(ringRadius(0) >= 8);
  assert.ok(ringRadius(1000) < ringRadius(100000));
  assert.ok(ringRadius(1e9) <= 44);
});

test('each level has its own colour and the ring carries the level word, the town and the supply', () => {
  assert.equal(new Set(Object.values(LEVEL_COLOR)).size, Object.keys(LEVEL_COLOR).length);
  const fc = balanceFeatures([row({}), row({ town: 'Taikkyi', level: 'short', lat: 17.3, lon: 95.97 })], (level) => `word-${level}`);
  assert.equal(fc.features.length, 2);
  const [first] = fc.features;
  assert.deepEqual(first.geometry, { type: 'Point', coordinates: [96.05, 17.1] });
  assert.equal(first.properties?.label, 'word-glut');
  assert.equal(first.properties?.color, LEVEL_COLOR.glut);
  assert.equal(first.properties?.town, 'Hmawbi');
});

test('the balance layer is a toggle, on by default, with its source and both layers defined', () => {
  assert.equal(DEFAULT_LAYERS.balance, true);
  assert.ok(LAYER_GROUPS.flatMap(([, items]) => items).some(([key]) => key === 'balance'));
  assert.ok(PLAIN_SOURCES.includes('aq-balance'));
  const ids = new Set(buildDataLayers().map((l) => l.spec.id));
  LAYER_MAP.balance.forEach((id) => assert.ok(ids.has(id), id));
});
