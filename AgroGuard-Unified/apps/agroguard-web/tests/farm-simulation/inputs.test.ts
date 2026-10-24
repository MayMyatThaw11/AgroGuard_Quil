import assert from 'node:assert/strict';
import test from 'node:test';
import { angleFor, arcPath, bandState, chillOf, dayFromAngle, dialKey, heatOf, pointerAngle, settleDay, snapToStep, wheelKey } from '../../src/features/farm-simulation/lib/inputs/dialMath.ts';
import { addDays, inSpan, monthGrid, shiftDate, shiftMonth } from '../../src/features/farm-simulation/lib/inputs/calendar.ts';

test('the dial runs 300 degrees from the left of the gap to the right, with the gap at the bottom', () => {
  assert.equal(angleFor(0, 100), -150);
  assert.equal(angleFor(100, 100), 150);
  assert.equal(angleFor(50, 100), 0);
  assert.equal(angleFor(5, 0), -150);
});

test('an angle gives back the nearest day, and the gap snaps to the nearer end', () => {
  assert.equal(dayFromAngle(0, 100), 50);
  assert.equal(dayFromAngle(-150, 100), 0);
  assert.equal(dayFromAngle(150, 100), 100);
  assert.equal(dayFromAngle(-75, 100), 25);
  assert.equal(dayFromAngle(-170, 100), 0);
  assert.equal(dayFromAngle(170, 100), 100);
  assert.equal(dayFromAngle(30, 0), 0);
});

test('the pointer angle is measured clockwise from the top', () => {
  assert.equal(pointerAngle(0, 0, 0, -10), 0);
  assert.equal(pointerAngle(0, 0, 10, 0), 90);
  assert.equal(Math.abs(pointerAngle(0, 0, 0, 10)), 180);
  assert.equal(pointerAngle(0, 0, -10, 0), -90);
});

test('dragging through the gap cannot jump from the last day to the first', () => {
  assert.equal(settleDay(98, 1, 100), 98);
  assert.equal(settleDay(3, 97, 100), 3);
  assert.equal(settleDay(40, 45, 100), 45);
  assert.equal(settleDay(0, 100, 100), 0);
});

test('an arc is drawn from one angle to another as an SVG path', () => {
  assert.equal(arcPath(0, 0, 10, 0, 90), 'M 0 -10 A 10 10 0 0 1 10 0');
  assert.equal(arcPath(0, 0, 10, -150, 150), 'M -5 8.66 A 10 10 0 1 1 5 8.66');
});

test('keys step the day, a week, or to either end, and never leave the season', () => {
  assert.equal(dialKey(10, 'ArrowRight', 100), 11);
  assert.equal(dialKey(10, 'ArrowUp', 100), 11);
  assert.equal(dialKey(10, 'ArrowLeft', 100), 9);
  assert.equal(dialKey(10, 'ArrowDown', 100), 9);
  assert.equal(dialKey(10, 'PageUp', 100), 17);
  assert.equal(dialKey(10, 'PageDown', 100), 3);
  assert.equal(dialKey(10, 'Home', 100), 0);
  assert.equal(dialKey(10, 'End', 100), 100);
  assert.equal(dialKey(99, 'PageUp', 100), 100);
  assert.equal(dialKey(2, 'PageDown', 100), 0);
  assert.equal(dialKey(10, 'a', 100), 10);
});

test('a value snaps to its step and stays inside its range without float noise', () => {
  assert.equal(snapToStep(7.3, 0.5, 0, 100), 7.5);
  assert.equal(snapToStep(-4, 1, 0, 100), 0);
  assert.equal(snapToStep(140, 1, 0, 100), 100);
  assert.equal(snapToStep(0.1 + 0.2, 0.1, 0, 1), 0.3);
  assert.equal(snapToStep(12.34, 5, 2, 100), 12);
});

test('wheel keys change a value by a step, a big step, or to either end', () => {
  const o = { step: 5, big: 25, min: 0, max: 100 };
  assert.equal(wheelKey(50, 'ArrowUp', o), 55);
  assert.equal(wheelKey(50, 'ArrowDown', o), 45);
  assert.equal(wheelKey(50, 'PageUp', o), 75);
  assert.equal(wheelKey(50, 'PageDown', o), 25);
  assert.equal(wheelKey(50, 'Home', o), 0);
  assert.equal(wheelKey(50, 'End', o), 100);
  assert.equal(wheelKey(98, 'ArrowUp', o), 100);
  assert.equal(wheelKey(50, 'x', o), 50);
});

test('heat rises from the ceiling over the span, and chill from the floor down', () => {
  assert.equal(heatOf(40, 60, 40), 0);
  assert.equal(heatOf(60, 60, 40), 0);
  assert.equal(heatOf(80, 60, 40), 0.5);
  assert.equal(heatOf(200, 60, 40), 1);
  assert.equal(chillOf(30, 25, 25), 0);
  assert.equal(chillOf(12.5, 25, 25), 0.5);
  assert.equal(chillOf(-10, 25, 25), 1);
});

test('a value is below, in or above a hint band, and unknown without one', () => {
  assert.equal(bandState(20, { min: 25, max: 60 }), 'below');
  assert.equal(bandState(40, { min: 25, max: 60 }), 'in');
  assert.equal(bandState(70, { min: 25, max: 60 }), 'above');
  assert.equal(bandState(70, { min: 25 }), 'in');
  assert.equal(bandState(70, {}), 'none');
  assert.equal(bandState(null, { min: 25, max: 60 }), 'none');
});

test('a month grid always has six Monday-first weeks and marks days of other months', () => {
  const grid = monthGrid(2026, 9);
  assert.equal(grid.length, 42);
  assert.equal(grid[0].date, '2026-09-28');
  assert.equal(grid[0].outside, true);
  assert.equal(grid[3].date, '2026-10-01');
  assert.equal(grid[3].outside, false);
  assert.equal(grid.filter((d) => !d.outside).length, 31);
  assert.equal(new Date(`${grid[0].date}T00:00:00Z`).getUTCDay(), 1);
});

test('adding days crosses months and years without drifting', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-06-24', 120), '2026-10-22');
});

test('months shift with year wrap and the span of a season is inclusive of its first day only', () => {
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, month: 11 });
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth(2026, 5, 3), { year: 2026, month: 8 });
  assert.equal(inSpan('2026-06-24', '2026-06-24', 120), true);
  assert.equal(inSpan('2026-10-21', '2026-06-24', 120), true);
  assert.equal(inSpan('2026-10-22', '2026-06-24', 120), false);
  assert.equal(inSpan('2026-06-23', '2026-06-24', 120), false);
  assert.equal(inSpan('2026-07-01', '', 120), false);
});

test('a date moves by whole months and keeps to the last day of a shorter month', () => {
  assert.equal(shiftDate('2026-01-31', 1), '2026-02-28');
  assert.equal(shiftDate('2028-01-31', 1), '2028-02-29');
  assert.equal(shiftDate('2026-03-15', -1), '2026-02-15');
  assert.equal(shiftDate('2026-12-10', 1), '2027-01-10');
  assert.equal(shiftDate('2026-01-10', -1), '2025-12-10');
});
