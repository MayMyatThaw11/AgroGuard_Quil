import assert from 'node:assert/strict';
import test from 'node:test';
import { insideRing, outlineQuery, pickOutline, suggestOutline } from '../../src/features/farm-simulation/lib/farmmap/osmOutline.ts';
import { tracedGeojson } from '../../src/features/farm-simulation/lib/farmmap/trace.ts';

const square = (id: number, d: number, landuse = 'paddy') => ({
  type: 'way',
  id,
  tags: { landuse },
  geometry: [
    { lat: 16.7, lon: 95.6 },
    { lat: 16.7, lon: 95.6 + d },
    { lat: 16.7 + d, lon: 95.6 + d },
    { lat: 16.7 + d, lon: 95.6 },
    { lat: 16.7, lon: 95.6 },
  ],
});

test('the query asks only for farm land uses near the point', () => {
  const q = outlineQuery(16.7123456, 95.6);
  assert.match(q, /around:500,16\.712346,95\.600000/);
  assert.match(q, /farmland\|paddy\|orchard\|plantation/);
});

test('the smallest containing outline wins and its closing point is dropped', () => {
  const out = pickOutline({ elements: [square(1, 0.01, 'farmland'), square(2, 0.001), { type: 'relation', id: 3 }] }, [16.7005, 95.6005]);
  assert.equal(out?.osmId, 'way/2');
  assert.equal(out?.landuse, 'paddy');
  assert.equal(out?.corners.length, 4);
  assert.ok((out?.areaHa ?? 0) > 1 && (out?.areaHa ?? 0) < 1.3);
});

test('no usable outline gives null instead of a guess', () => {
  assert.equal(pickOutline({ elements: [] }, [1, 1]), null);
  assert.equal(pickOutline({ elements: [{ type: 'way', id: 9, geometry: [{ lat: 1, lon: 1 }, { lat: 1, lon: 1 }] }] }, [1, 1]), null);
  assert.equal(pickOutline(null, [1, 1]), null);
  assert.equal(pickOutline({ elements: [square(4, 0.001)] }, [16.71, 95.61]), null, 'a nearby field that does not contain the point is not offered');
});

test('a failing mirror falls back to the next one', async () => {
  const seen: string[] = [];
  const fetcher = (async (url: string) => {
    seen.push(url);
    if (seen.length === 1) return new Response('busy', { status: 429 });
    return new Response(JSON.stringify({ elements: [square(7, 0.001)] }), { status: 200 });
  }) as typeof fetch;
  const out = await suggestOutline(16.7005, 95.6005, fetcher);
  assert.equal(out?.osmId, 'way/7');
  assert.equal(seen.length, 2);
});

test('a suggested outline records where it came from in the saved file', () => {
  const doc = JSON.parse(tracedGeojson([[16.7, 95.6], [16.7, 95.601], [16.701, 95.601]], 'F1', 'suggested from OpenStreetMap way/7, confirmed by user') ?? '{}');
  assert.equal(doc.features[0].properties.source, 'suggested from OpenStreetMap way/7, confirmed by user');
});

test('point in ring follows the even-odd rule', () => {
  const ring: [number, number][] = [[0, 0], [0, 2], [2, 2], [2, 0]];
  assert.equal(insideRing([1, 1], ring), true);
  assert.equal(insideRing([3, 1], ring), false);
});
