import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_CORNERS, ringAreaHa, traceFeatures, tracedGeojson, tracedRing } from '../../src/features/farm-simulation/lib/farmmap/trace.ts';

const corners: [number, number][] = [
  [19.75, 96.13],
  [19.75, 96.131],
  [19.751, 96.131],
  [19.751, 96.13],
];

test('a traced ring closes itself and keeps lat, lon order like the contract', () => {
  const ring = tracedRing(corners);
  assert.equal(ring.length, 5);
  assert.deepEqual(ring[0], ring[4]);
  assert.deepEqual(tracedRing([...corners, corners[0]]), ring);
});

test('fewer than three corners is not a field', () => {
  assert.equal(MIN_CORNERS, 3);
  assert.equal(tracedGeojson(corners.slice(0, 2), 'Plot A'), null);
});

test('the saved GeoJSON is lon, lat and names the field for onboarding', () => {
  const text = tracedGeojson(corners, 'Plot A');
  assert.ok(text);
  const doc = JSON.parse(text);
  assert.equal(doc.type, 'FeatureCollection');
  const [feature] = doc.features;
  assert.equal(feature.properties.field, 'Plot A');
  assert.equal(feature.properties.source, 'traced on the farm map');
  assert.equal(feature.geometry.type, 'Polygon');
  const ring = feature.geometry.coordinates[0];
  assert.deepEqual(ring[0], [96.13, 19.75]);
  assert.deepEqual(ring[0], ring[ring.length - 1]);
});

test('area matches the server formula (contract.ring_area_ha gives 1.158 ha here)', () => {
  assert.equal(ringAreaHa(tracedRing(corners)), 1.158);
  assert.equal(ringAreaHa(tracedRing(corners.slice(0, 2))), 0);
});

test('the map preview draws corners and, from two corners, the outline', () => {
  assert.equal(traceFeatures([]).features.length, 0);
  assert.equal(traceFeatures(corners.slice(0, 1)).features.length, 1);
  const preview = traceFeatures(corners);
  assert.equal(preview.features.filter((f) => f.geometry.type === 'Point').length, 4);
  assert.equal(preview.features.filter((f) => f.geometry.type === 'Polygon').length, 1);
});
