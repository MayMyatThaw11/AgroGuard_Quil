import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFarm } from '../../src/features/farm-simulation/data/fleet/farmGenerator.ts';
import { buildFleet, type FleetField } from '../../src/features/farm-simulation/data/fleet/fleetFields.ts';
import {
  EMPTY_FILTER,
  STATUS_ORDER,
  WATCH_MARGIN_CM,
  alertQueue,
  applyFilter,
  countByStatus,
  farmSummary,
  fieldStatus,
  formatCm,
  meanNdvi,
  mosaicGrid,
  mosaicIndexAt,
  rampColor,
  sortFarmsForList,
  sortRows,
  toggleInSet,
  virtualWindow,
  withStatus,
} from '../../src/features/farm-simulation/lib/fleetQuery.ts';

const fleet = buildFleet();
const SAFE = -15;

function field(overrides: Partial<FleetField>): FleetField {
  return {
    id: 'AY-0001',
    region: 'Ayeyarwady',
    regionCode: 'AY',
    coop: 'Maubin Coop 01',
    crop: 'Paw San rice',
    stage: 'Tillering',
    day: 40,
    water: -8,
    low: -10,
    ndvi: 0.6,
    area: 0.7,
    offline: false,
    ...overrides,
  };
}

test('Fleet query: status follows the AWD safe depth with a 2.5 cm watch margin', () => {
  assert.equal(WATCH_MARGIN_CM, 2.5);
  assert.equal(fieldStatus(field({ low: -16 }), SAFE), 'alert');
  assert.equal(fieldStatus(field({ low: -15 }), SAFE), 'watch');
  assert.equal(fieldStatus(field({ low: -14 }), SAFE), 'watch');
  assert.equal(fieldStatus(field({ low: -12.5 }), SAFE), 'ok');
  assert.equal(fieldStatus(field({ low: -12 }), SAFE), 'ok');
  assert.equal(fieldStatus(field({ low: -30, offline: true }), SAFE), 'offline');
});

test('Fleet query: a different safe depth from the paddy settings moves the thresholds', () => {
  assert.equal(fieldStatus(field({ low: -11 }), -10), 'alert');
  assert.equal(fieldStatus(field({ low: -9 }), -10), 'watch');
  assert.equal(fieldStatus(field({ low: -7 }), -10), 'ok');
});

test('Fleet query: status counts add up to the number of rows', () => {
  const rows = withStatus(fleet.fields, SAFE);
  const counts = countByStatus(rows);
  assert.equal(counts.ok + counts.watch + counts.alert + counts.offline, 3600);
  assert.ok(counts.alert > 0 && counts.ok > 0);
});

test('Fleet query: an empty filter keeps every row and each filter narrows the set', () => {
  const rows = withStatus(fleet.fields, SAFE);
  assert.equal(applyFilter(rows, EMPTY_FILTER).length, 3600);
  const regionOnly = applyFilter(rows, { ...EMPTY_FILTER, regions: new Set(['AY']) });
  assert.equal(regionOnly.length, 1400);
  const alertsOnly = applyFilter(rows, { ...EMPTY_FILTER, status: new Set(['alert' as const]) });
  assert.ok(alertsOnly.every((row) => row.status === 'alert'));
  const crop = applyFilter(rows, { ...EMPTY_FILTER, crops: new Set(['Sesame']) });
  assert.ok(crop.every((row) => row.crop === 'Sesame'));
  const both = applyFilter(rows, { ...EMPTY_FILTER, regions: new Set(['AY']), status: new Set(['alert' as const]) });
  assert.ok(both.length <= regionOnly.length && both.every((row) => row.regionCode === 'AY' && row.status === 'alert'));
});

test('Fleet query: search matches field id or cooperative without regard to case', () => {
  const rows = withStatus(fleet.fields, SAFE);
  const byId = applyFilter(rows, { ...EMPTY_FILTER, query: 'ay-0007' });
  assert.deepEqual(byId.map((row) => row.id), ['AY-0007']);
  const byCoop = applyFilter(rows, { ...EMPTY_FILTER, query: ' maubin coop 01 ' });
  assert.ok(byCoop.length > 0 && byCoop.every((row) => row.coop.toLowerCase() === 'maubin coop 01'));
  assert.equal(applyFilter(rows, { ...EMPTY_FILTER, query: 'zzzz' }).length, 0);
});

test('Fleet query: toggleInSet returns a new set and flips membership', () => {
  const original = new Set(['a']);
  const added = toggleInSet(original, 'b');
  assert.deepEqual([...original], ['a']);
  assert.deepEqual([...added].sort(), ['a', 'b']);
  assert.deepEqual([...toggleInSet(added, 'a')], ['b']);
});

test('Fleet query: the alert queue lists only alerts, lowest first', () => {
  const rows = withStatus(fleet.fields, SAFE);
  const queue = alertQueue(rows);
  assert.ok(queue.length > 0);
  assert.ok(queue.every((row) => row.status === 'alert'));
  for (let i = 1; i < queue.length; i += 1) assert.ok(queue[i - 1].low <= queue[i].low);
});

test('Fleet query: mean NDVI handles an empty list and a simple pair', () => {
  assert.equal(meanNdvi([]), 0);
  const rows = withStatus([field({ ndvi: 0.4 }), field({ id: 'AY-0002', ndvi: 0.6 })], SAFE);
  assert.ok(Math.abs(meanNdvi(rows) - 0.5) < 1e-9);
});

test('Fleet query: sorting never mutates the input and honours direction', () => {
  const rows = withStatus([field({ id: 'AY-0001', low: -5 }), field({ id: 'AY-0002', low: -20 }), field({ id: 'AY-0003', low: -12 })], SAFE);
  const asc = sortRows(rows, 'low', 'asc');
  assert.deepEqual(asc.map((row) => row.id), ['AY-0002', 'AY-0003', 'AY-0001']);
  assert.deepEqual(sortRows(rows, 'low', 'desc').map((row) => row.id), ['AY-0001', 'AY-0003', 'AY-0002']);
  assert.deepEqual(rows.map((row) => row.id), ['AY-0001', 'AY-0002', 'AY-0003']);
});

test('Fleet query: status sorts alert, watch, offline, then ok', () => {
  assert.deepEqual(STATUS_ORDER, { alert: 0, watch: 1, offline: 2, ok: 3 });
  const rows = withStatus(
    [field({ id: 'a', low: -5 }), field({ id: 'b', low: -20 }), field({ id: 'c', low: -14 }), field({ id: 'd', offline: true })],
    SAFE
  );
  assert.deepEqual(sortRows(rows, 'status', 'asc').map((row) => row.id), ['b', 'c', 'd', 'a']);
});

test('Fleet query: the virtual window covers the viewport plus overscan and clamps to the list', () => {
  assert.deepEqual(virtualWindow(0, 340, 34, 3600, 6), { start: 0, end: 16 });
  assert.deepEqual(virtualWindow(3400, 340, 34, 3600, 6), { start: 94, end: 116 });
  assert.deepEqual(virtualWindow(0, 340, 34, 5, 6), { start: 0, end: 5 });
  assert.deepEqual(virtualWindow(0, 340, 34, 0, 6), { start: 0, end: 0 });
});

test('Fleet query: the mosaic grid packs cells and maps points back to indices', () => {
  const grid = mosaicGrid(600, 3600, 9, 2);
  assert.equal(grid.step, 11);
  assert.equal(grid.cols, 54);
  assert.equal(grid.rows, 67);
  assert.equal(grid.height, 67 * 11 - 2);
  assert.equal(mosaicIndexAt(0, 0, grid, 3600), 0);
  assert.equal(mosaicIndexAt(11 * 3 + 2, 11 + 2, grid, 3600), 54 + 3);
  assert.equal(mosaicIndexAt(-1, 5, grid, 3600), -1);
  assert.equal(mosaicIndexAt(11 * 54 + 1, 5, grid, 3600), -1);
  const small = mosaicGrid(600, 10, 9, 2);
  assert.equal(mosaicIndexAt(11 * 9 + 1, 0, small, 10), 9);
  assert.equal(mosaicIndexAt(0, 11, small, 10), -1);
});

test('Fleet query: colour ramps clamp at the ends and interpolate between stops', () => {
  const stops: readonly (readonly [number, string])[] = [
    [0, '#000000'],
    [10, '#ffffff'],
  ];
  assert.equal(rampColor(stops, -5), '#000000');
  assert.equal(rampColor(stops, 20), '#ffffff');
  assert.equal(rampColor(stops, 5), '#808080');
});

test('Fleet query: centimetres use a true minus sign and one decimal', () => {
  assert.equal(formatCm(-9.04), '−9.0 cm');
  assert.equal(formatCm(5), '5.0 cm');
});

test('Fleet query: a farm summary counts alerts and watches against the safe depth', () => {
  const farm = generateFarm(12);
  const summary = farmSummary(farm, SAFE);
  assert.equal(summary.alerts, farm.paddies.filter((paddy) => paddy.low < SAFE).length);
  assert.equal(summary.lowest, Math.min(...farm.paddies.map((paddy) => paddy.low)));
  assert.ok(Math.abs(summary.ndvi - farm.paddies.reduce((sum, paddy) => sum + paddy.ndvi, 0) / 8) < 1e-9);
  const stricter = farmSummary(farm, -4);
  assert.ok(stricter.alerts >= summary.alerts);
  assert.equal(farmSummary({ ...farm, offline: true }, SAFE).status, 'offline');
});

test('Fleet query: the farm list puts alerts first and then the lowest forecasts', () => {
  const farms = [generateFarm(1), generateFarm(2), generateFarm(3), generateFarm(4), generateFarm(5)];
  const sorted = sortFarmsForList(farms, SAFE);
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1].summary;
    const b = sorted[i].summary;
    assert.ok(STATUS_ORDER[a.status] < STATUS_ORDER[b.status] || (a.status === b.status && a.lowest <= b.lowest));
  }
  assert.equal(sorted.length, 5);
});
