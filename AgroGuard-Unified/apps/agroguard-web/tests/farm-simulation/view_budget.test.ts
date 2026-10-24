import assert from 'node:assert/strict';
import test from 'node:test';
import { DRAW_CALL_LIMIT, budgetFor } from '../../src/features/farm-simulation/lib/farmview/budget.ts';

test('a desktop gets the full instance caps and up to double pixel density', () => {
  const b = budgetFor(1440, 8);
  assert.deepEqual({ trees: b.trees, rice: b.rice, riceOther: b.riceOther, weeds: b.weeds, dprMax: b.dprMax, weak: b.weak, triangles: b.triangles }, { trees: 8000, rice: 4000, riceOther: 400, weeds: 1200, dprMax: 2, weak: false, triangles: 1_500_000 });
});

test('a narrow screen halves the caps and keeps pixel density at one', () => {
  const b = budgetFor(375, 8);
  assert.deepEqual({ trees: b.trees, rice: b.rice, riceOther: b.riceOther, weeds: b.weeds, dprMax: b.dprMax, weak: b.weak, triangles: b.triangles }, { trees: 4000, rice: 2000, riceOther: 200, weeds: 600, dprMax: 1, weak: true, triangles: 600_000 });
});

test('four cores or fewer count as a weak device even on a wide screen', () => {
  assert.equal(budgetFor(1440, 4).weak, true);
  assert.equal(budgetFor(1440, 5).weak, false);
  assert.equal(budgetFor(639, 16).weak, true);
  assert.equal(budgetFor(640, 16).weak, false);
});

test('the draw call limit is 120', () => {
  assert.equal(DRAW_CALL_LIMIT, 120);
});
