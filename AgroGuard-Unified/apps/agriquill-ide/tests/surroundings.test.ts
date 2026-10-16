import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceKm, favors, kindOf, mergeNearest, nearest, type NearFeature, type Nearest } from '../src/lib/farmmap/surroundings.ts';

const LAT = 16.7;
const LON = 95.6;
const KM = 1 / 111.32;

const square = (dLat: number, dLon: number, size: number): number[][] => [
  [LON + dLon, LAT + dLat],
  [LON + dLon + size, LAT + dLat],
  [LON + dLon + size, LAT + dLat + size],
  [LON + dLon, LAT + dLat + size],
  [LON + dLon, LAT + dLat],
];

test('OpenMapTiles classes map to the features a farmer cares about', () => {
  assert.equal(kindOf('waterway', 'stream'), 'river');
  assert.equal(kindOf('waterway', 'ditch'), 'canal');
  assert.equal(kindOf('water', 'ocean'), 'coast');
  assert.equal(kindOf('water', 'pond'), 'lake');
  assert.equal(kindOf('landcover', 'wood'), 'forest');
  assert.equal(kindOf('landcover', 'farmland'), null);
  assert.equal(kindOf('building', 'river'), null);
});

test('distance is zero inside a polygon and measured to the edge outside it', () => {
  assert.equal(distanceKm(LAT, LON, { type: 'Polygon', coordinates: [square(-0.01, -0.01, 0.02)] }), 0);
  const north = distanceKm(LAT, LON, { type: 'Polygon', coordinates: [square(2 * KM, -0.01, 0.02)] });
  assert.ok(Math.abs(north - 2) < 0.01);
  const line = distanceKm(LAT, LON, { type: 'LineString', coordinates: [[LON - 1, LAT + 0.5 * KM], [LON + 1, LAT + 0.5 * KM]] });
  assert.ok(Math.abs(line - 0.5) < 0.01);
});

test('nearest keeps the closest feature per kind and ignores anything past the searched radius', () => {
  const features: NearFeature[] = [
    { layer: 'waterway', cls: 'river', name: 'Far river', ele: null, geometry: { type: 'LineString', coordinates: [[LON - 1, LAT + 3 * KM], [LON + 1, LAT + 3 * KM]] } },
    { layer: 'waterway', cls: 'river', name: 'Near river', ele: null, geometry: { type: 'LineString', coordinates: [[LON - 1, LAT + KM], [LON + 1, LAT + KM]] } },
    { layer: 'water', cls: 'ocean', name: null, ele: null, geometry: { type: 'Polygon', coordinates: [square(9 * KM, -0.5, 1)] } },
    { layer: 'mountain_peak', cls: 'peak', name: 'Low', ele: 200, geometry: { type: 'Point', coordinates: [LON + 0.01, LAT] } },
    { layer: 'mountain_peak', cls: 'peak', name: 'High', ele: 900, geometry: { type: 'Point', coordinates: [LON + 0.02, LAT] } },
  ];
  const near = nearest(LAT, LON, features, 5);
  assert.equal(near.river?.name, 'Near river');
  assert.equal(near.coast, null);
  assert.equal(near.peak?.name, 'High');
  assert.equal(near.forest, null);
});

test('merging two scans keeps every feature found and the closest distance', () => {
  const none: Nearest = { river: null, canal: null, coast: null, lake: null, forest: null, wetland: null, peak: null };
  const wide: Nearest = { ...none, coast: { km: 8, name: null, ele: null }, river: { km: 1.2, name: 'Bassein', ele: null } };
  const close: Nearest = { ...none, river: { km: 0.4, name: null, ele: null }, canal: { km: 0.2, name: null, ele: null } };
  const merged = mergeNearest(wide, close);
  assert.equal(merged.coast?.km, 8);
  assert.deepEqual(merged.river, { km: 0.4, name: 'Bassein', ele: null });
  assert.equal(merged.canal?.km, 0.2);
});

test('screening rules fire only on evidence and say nothing when elevation is unknown', () => {
  const near = nearest(LAT, LON, [
    { layer: 'water', cls: 'ocean', name: null, ele: null, geometry: { type: 'Polygon', coordinates: [square(4 * KM, -0.5, 1)] } },
    { layer: 'waterway', cls: 'river', name: 'Bassein', ele: null, geometry: { type: 'LineString', coordinates: [[LON - 1, LAT + KM], [LON + 1, LAT + KM]] } },
  ], 20);
  const low = favors(near, 3).map((f) => `${f.kind}:${f.tone}`);
  assert.deepEqual(low, ['coast:watch', 'coast:info', 'river:good', 'river:watch', 'elevation:watch']);
  const unknown = favors(near, null).map((f) => `${f.kind}:${f.tone}`);
  assert.deepEqual(unknown, ['coast:watch', 'coast:info', 'river:good']);
  assert.deepEqual(favors({ river: null, canal: null, coast: null, lake: null, forest: null, wetland: null, peak: null }, null), []);
});
