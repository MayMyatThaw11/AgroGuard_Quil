import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelChart, verdictOf, type WaterPlan } from '../../src/features/farm-simulation/lib/farmview/planner.ts';

const day = (i: number, cm: number) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, level_cm: cm, net_mm: 0, spill_mm: 0 });
const plan = (low: number[], high: number[], first: WaterPlan['first_below']): WaterPlan => ({
  trench: { length_m: 400, top_w_m: 2, bottom_w_m: 0.8, depth_m: 0.6, volume_m3: 500, surface_m2: 800, share: 0.08 },
  start_cm: 54,
  min_cm: 30,
  seepage_mm_day: { low: 1, high: 3, soil: 'clay' },
  runs: { wet_soil: low.map((v, i) => day(i, v)), dry_soil: high.map((v, i) => day(i, v)) },
  first_below: first,
  refill: { m3: 55, pump_days: 0.8 },
  evaporation: { kc: 1.05, source: 'FAO-56' },
  status: 'TO VERIFY',
});

test('Planner: no day below the minimum reads as a calm verdict', () => {
  const v = verdictOf(plan([50, 48], [49, 46], null));
  assert.equal(v.kind, 'ok');
});

test('Planner: a day below the minimum names the date and the refill volume', () => {
  const v = verdictOf(plan([50, 40], [49, 28], { date: '2026-11-02', level_cm: 28, net_mm: -7, spill_mm: 0 }));
  assert.deepEqual(v, { kind: 'low', date: '2026-11-02', m3: 55 });
});

test('Planner: the chart band runs from the dry-soil to the wet-soil level on a common scale', () => {
  const chart = levelChart(plan([54, 50, 46], [54, 44, 34], null), 300, 120, 60);
  assert.equal(chart.line.length, 3);
  assert.equal(chart.band.split(' ').filter((p) => p.startsWith('M') || p.startsWith('L')).length, 6);
  const [first, , last] = chart.line;
  assert.ok(first.x < last.x && last.y > first.y, 'a falling level draws lower on screen');
  assert.ok(chart.minY > 0 && chart.minY < 120);
  assert.ok(chart.line.every((p) => p.y >= 0 && p.y <= 120 && p.x >= 0 && p.x <= 300));
});

test('Planner: a single day still draws a point and an empty run draws nothing', () => {
  assert.equal(levelChart(plan([50], [48], null), 300, 120, 60).line.length, 1);
  assert.equal(levelChart(plan([], [], null), 300, 120, 60).line.length, 0);
});
