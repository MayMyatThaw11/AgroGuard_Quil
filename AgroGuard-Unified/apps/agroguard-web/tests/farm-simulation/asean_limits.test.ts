import assert from 'node:assert/strict';
import test from 'node:test';
import { ASEAN_BOXES, MIN_MAP_ZOOM, VIEW_LIMIT, clampCenter, inAsean } from '../../src/features/farm-simulation/lib/farmmap/aseanLimits.ts';
import { getFarmMap } from '../../src/features/farm-simulation/lib/farmmap/farmMapData.ts';
import { coordinateProblem, parseCoordinates } from '../../src/features/farm-simulation/lib/farmmap/farmMapSearch.ts';

const CAPITALS: [string, number, number][] = [
  ['Naypyidaw', 19.75, 96.1], ['Bangkok', 13.75, 100.5], ['Hanoi', 21.03, 105.85], ['Phnom Penh', 11.55, 104.92], ['Vientiane', 17.97, 102.6],
  ['Jakarta', -6.2, 106.85], ['Kuala Lumpur', 3.14, 101.69], ['Singapore', 1.35, 103.82], ['Manila', 14.6, 120.98], ['Bandar Seri Begawan', 4.89, 114.94], ['Dili', -8.56, 125.57],
];
const ELSEWHERE: [string, number, number][] = [
  ['Delhi', 28.61, 77.21], ['Beijing', 39.9, 116.4], ['Taipei', 25.03, 121.56], ['Dhaka', 23.81, 90.41], ['Perth', -31.95, 115.86], ['Darwin', -12.46, 130.84], ['Paris', 48.86, 2.35],
];

test('every ASEAN member has a screening box and every capital is inside', () => {
  assert.equal(Object.keys(ASEAN_BOXES).length, 11);
  for (const [name, lat, lon] of CAPITALS) assert.equal(inAsean({ lat, lon }), true, name);
});

test('places outside ASEAN are not covered', () => {
  for (const [name, lat, lon] of ELSEWHERE) assert.equal(inAsean({ lat, lon }), false, name);
});

test('every member country can be centred inside the view limit and the zoom floor keeps the world out', () => {
  for (const b of Object.values(ASEAN_BOXES)) {
    const lon = (b.w + b.e) / 2;
    const lat = (b.s + b.n) / 2;
    assert.deepEqual(clampCenter(lon, lat), [lon, lat]);
  }
  assert.ok(MIN_MAP_ZOOM >= 3);
});

test('a map centre outside the limit is pulled back to the nearest edge, one inside is unchanged', () => {
  assert.deepEqual(clampCenter(108, 8), [108, 8]);
  assert.deepEqual(clampCenter(10, 8), [VIEW_LIMIT.w, 8]);
  assert.deepEqual(clampCenter(108, 60), [108, VIEW_LIMIT.n]);
  assert.ok(VIEW_LIMIT.w > 90 && VIEW_LIMIT.e < 140);
  assert.deepEqual(clampCenter(200, -50), [VIEW_LIMIT.e, VIEW_LIMIT.s]);
});

test('every generated farm and town sits inside ASEAN', () => {
  const map = getFarmMap();
  for (const a of map.anchors) assert.equal(inAsean({ lat: a.lat, lon: a.lon }), true, `${a.town} ${a.country}`);
});

test('coordinates outside ASEAN get a clear problem and no fly-to result', () => {
  assert.equal(coordinateProblem('28.61, 77.21'), 'outside');
  assert.deepEqual(parseCoordinates('28.61, 77.21'), []);
  assert.equal(coordinateProblem('16.73, 95.65'), null);
  assert.equal(parseCoordinates('16.73, 95.65')?.length, 1);
  assert.equal(coordinateProblem('maubin'), null);
});
