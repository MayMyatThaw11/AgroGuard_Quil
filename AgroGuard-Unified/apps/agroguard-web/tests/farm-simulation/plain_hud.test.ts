import assert from 'node:assert/strict';
import test from 'node:test';
import { SCREENING } from '../../src/features/farm-simulation/lib/farmmap/surroundings.ts';
import { distanceWord, heightLine, terrainKey } from '../../src/features/farm-simulation/lib/farmview/plainHud.ts';
import { GUIDE_KEY, guideSeen, markGuideSeen } from '../../src/features/farm-simulation/lib/farmview/guideSeen.ts';
import type { Terrain } from '../../src/features/farm-simulation/lib/farmview/profile.ts';

test('height line says above, near or below sea level in whole metres', () => {
  assert.equal(heightLine(null), null);
  assert.deepEqual(heightLine(1015.4), { kind: 'above', m: 1015 });
  assert.deepEqual(heightLine(SCREENING.lowlandM + 1), { kind: 'above', m: SCREENING.lowlandM + 1 });
  assert.deepEqual(heightLine(SCREENING.lowlandM), { kind: 'near', m: SCREENING.lowlandM });
  assert.deepEqual(heightLine(0), { kind: 'near', m: 0 });
  assert.deepEqual(heightLine(-SCREENING.lowlandM), { kind: 'near', m: -SCREENING.lowlandM });
  assert.deepEqual(heightLine(-SCREENING.lowlandM - 1.4), { kind: 'below', m: SCREENING.lowlandM + 1 });
});

test('a height inside the lowland band is never called below or above sea level', () => {
  for (let m = -SCREENING.lowlandM; m <= SCREENING.lowlandM; m += 0.5) assert.equal(heightLine(m)?.kind, 'near');
});

test('every terrain class has its own plain word', () => {
  const classes: Terrain[] = ['flat', 'rolling', 'hilly', 'mountainous', 'unknown'];
  const keys = classes.map(terrainKey);
  assert.equal(new Set(keys).size, classes.length);
  for (const key of keys) assert.match(key, /^farmMap\.farmView\.terrain\./);
});

const memory = (seed: Record<string, string> = {}) => {
  const data = { ...seed };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
};

test('the guide shows once, then stays hidden after it is marked seen', () => {
  const store = memory();
  assert.equal(guideSeen(store), false);
  markGuideSeen(store);
  assert.equal(guideSeen(store), true);
  assert.equal(guideSeen(memory({ [GUIDE_KEY]: '1' })), true);
});

test('a missing or blocked storage shows the guide and never throws', () => {
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(guideSeen(blocked), false);
  assert.doesNotThrow(() => markGuideSeen(blocked));
  assert.equal(guideSeen(null), false);
  assert.doesNotThrow(() => markGuideSeen(null));
});

test('distances read as at the edge, whole tens of metres, or kilometres', () => {
  assert.deepEqual(distanceWord(0), { kind: 'edge' });
  assert.deepEqual(distanceWord(0.049), { kind: 'edge' });
  assert.deepEqual(distanceWord(0.2), { kind: 'metres', value: 200 });
  assert.deepEqual(distanceWord(0.943), { kind: 'metres', value: 940 });
  assert.deepEqual(distanceWord(0.996), { kind: 'km', value: '1.0' });
  assert.deepEqual(distanceWord(25.04), { kind: 'km', value: '25.0' });
});
