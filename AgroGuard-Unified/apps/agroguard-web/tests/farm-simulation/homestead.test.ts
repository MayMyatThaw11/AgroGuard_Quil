import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundVegetation, homestead } from '../../src/features/farm-simulation/lib/farmview/homestead.ts';
import { inside, type XZ } from '../../src/features/farm-simulation/lib/fieldsim/localFrame.ts';

const field: XZ[] = [[-50, -40], [50, -40], [50, 40], [-50, 40]];
const flat = () => 0;
const open = () => true;

test('Homestead: the hut stands outside every field and within 30 m of the main field', () => {
  const site = homestead({ main: field, others: [], seed: 'AQ-1', paddy: true, groundAt: flat, isFree: open });
  assert.ok(site);
  const { hut } = site;
  assert.ok(!inside([hut.x, hut.z], field));
  const gap = Math.min(...field.map(([x, z]) => Math.hypot(hut.x - x, hut.z - z)));
  assert.ok(gap < 60);
  const edge = Math.min(Math.abs(Math.abs(hut.x) - 50), Math.abs(Math.abs(hut.z) - 40));
  assert.ok(edge < 30);
});

test('Homestead: the same farm id always gets the same layout', () => {
  const a = homestead({ main: field, others: [], seed: 'AQ-7', paddy: true, groundAt: flat, isFree: open });
  const b = homestead({ main: field, others: [], seed: 'AQ-7', paddy: true, groundAt: flat, isFree: open });
  assert.deepEqual(a, b);
  const c = homestead({ main: field, others: [], seed: 'AQ-8', paddy: true, groundAt: flat, isFree: open });
  assert.notDeepEqual(a?.hut, c?.hut);
});

test('Homestead: the hut avoids a neighbouring field and blocked ground and prefers level ground', () => {
  const neighbour: XZ[] = [[-50, 45], [50, 45], [50, 120], [-50, 120]];
  const site = homestead({ main: field, others: [neighbour], seed: 'AQ-2', paddy: false, groundAt: flat, isFree: open });
  assert.ok(site && !inside([site.hut.x, site.hut.z], neighbour));
  const slope = (x: number) => (x > 0 ? 6 : 0);
  const level = homestead({ main: field, others: [], seed: 'AQ-3', paddy: false, groundAt: (x) => slope(x), isFree: open });
  assert.ok(level && level.hut.x <= 50);
  const none = homestead({ main: field, others: [], seed: 'AQ-4', paddy: false, groundAt: flat, isFree: () => false });
  assert.equal(none, null);
});

test('Homestead: buffalo graze only beside paddy and bananas stand around the hut', () => {
  const rice = homestead({ main: field, others: [], seed: 'AQ-5', paddy: true, groundAt: flat, isFree: open });
  const dry = homestead({ main: field, others: [], seed: 'AQ-5', paddy: false, groundAt: flat, isFree: open });
  assert.ok(rice && rice.buffalo.length >= 1);
  assert.equal(dry?.buffalo.length, 0);
  assert.ok(rice.banana.length >= 2);
  for (const b of rice.banana) assert.ok(Math.hypot(b.x - rice.hut.x, b.z - rice.hut.z) < 12);
});

test('Bund vegetation: palms and shrubs line the field edge, never inside a field, same every time', () => {
  const input = { main: field, others: [], seed: 'AQ-9', paddy: true, groundAt: flat, isFree: open };
  const a = bundVegetation(input);
  assert.ok(a.palm.length >= 3 && a.shrub.length >= 3);
  for (const spot of [...a.palm, ...a.shrub, ...a.reeds]) assert.ok(!inside([spot.x, spot.z], field));
  assert.deepEqual(a, bundVegetation(input));
});

test('Bund vegetation: palms keep at least 8 m apart and reeds only grow beside paddy', () => {
  const a = bundVegetation({ main: field, others: [], seed: 'AQ-10', paddy: true, groundAt: flat, isFree: open });
  for (let i = 0; i < a.palm.length; i += 1) {
    for (let j = i + 1; j < a.palm.length; j += 1) assert.ok(Math.hypot(a.palm[i].x - a.palm[j].x, a.palm[i].z - a.palm[j].z) >= 8);
  }
  assert.ok(a.reeds.length >= 1);
  const dry = bundVegetation({ main: field, others: [], seed: 'AQ-10', paddy: false, groundAt: flat, isFree: open });
  assert.equal(dry.reeds.length, 0);
});
