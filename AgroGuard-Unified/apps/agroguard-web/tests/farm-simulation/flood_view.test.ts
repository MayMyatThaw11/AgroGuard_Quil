import assert from 'node:assert/strict';
import test from 'node:test';
import { SCREENING, type Nearest } from '../../src/features/farm-simulation/lib/farmmap/surroundings.ts';
import { WHAT_IF, lowLyingNotes, waterLevelY } from '../../src/features/farm-simulation/lib/farmview/flood.ts';

const none = (): Nearest => ({ river: null, canal: null, coast: null, lake: null, forest: null, wetland: null, peak: null });
const hit = (km: number) => ({ km, name: null, ele: null });

test('low ground beside a river and near sea level give both notes', () => {
  const near = { ...none(), river: hit(1) };
  const kinds = lowLyingNotes(near, SCREENING.lowlandM - 1).map((n) => n.kind);
  assert.deepEqual(kinds.sort(), ['elevation', 'river']);
});

test('a river note needs low ground, and high ground gets no low-lying note', () => {
  const near = { ...none(), river: hit(1) };
  assert.deepEqual(lowLyingNotes(near, SCREENING.floodElevationM + 40), []);
  const only = lowLyingNotes(near, SCREENING.floodElevationM - 1).map((n) => n.kind);
  assert.deepEqual(only, ['river']);
});

test('a far river and unknown height give no low-lying note', () => {
  assert.deepEqual(lowLyingNotes({ ...none(), river: hit(SCREENING.riverKm + 1) }, 3).map((n) => n.kind), ['elevation']);
  assert.deepEqual(lowLyingNotes(none(), null), []);
});

test('coast salinity advice is not a low-lying note', () => {
  assert.deepEqual(lowLyingNotes({ ...none(), coast: hit(2) }, 200), []);
});

test('the what-if wheel runs from nothing up to three metres in quarter-metre steps', () => {
  assert.deepEqual({ min: WHAT_IF.min, max: WHAT_IF.max, step: WHAT_IF.step }, { min: 0, max: 3, step: 0.25 });
  assert.equal((WHAT_IF.max - WHAT_IF.min) % WHAT_IF.step, 0);
});

test('the water level sits the chosen depth above the field pad', () => {
  assert.equal(waterLevelY(12.5, 0), 12.5);
  assert.equal(waterLevelY(12.5, 1.25), 13.75);
  assert.equal(waterLevelY(-3, 2), -1);
});
