import assert from 'node:assert/strict';
import test from 'node:test';
import { bundStrip, inside, insetRing, localFrame, plantGrid, ringArea } from '../../src/features/farm-simulation/lib/fieldsim/localFrame.ts';
import { tilesFor } from '../../src/features/farm-simulation/lib/fieldsim/imagery.ts';

// The 0.42-acre test box from the mill documents, as [lat, lon].
const BOX: [number, number][] = [
  [17.097815, 95.180805],
  [17.097815, 95.181195],
  [17.098185, 95.181195],
  [17.098185, 95.180805],
  [17.097815, 95.180805],
];

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('a 0.42 acre square projects to sides of about 41 m', () => {
  const frame = localFrame(BOX);
  assert.ok(frame);
  const r = frame.ring;
  assert.equal(r.length, 4);
  assert.ok(Math.abs(dist(r[0], r[1]) - 41.5) < 0.5, `east side ${dist(r[0], r[1])}`);
  assert.ok(Math.abs(dist(r[1], r[2]) - 40.9) < 0.5, `north side ${dist(r[1], r[2])}`);
  assert.ok(Math.abs(ringArea(r) - 1700) < 30, `area ${ringArea(r)}`);
  const back = frame.toLocal(BOX[2][0], BOX[2][1]);
  assert.ok(dist(back, r[2]) < 1e-6);
});

test('fewer than three points give no frame', () => {
  assert.equal(localFrame([]), null);
  assert.equal(localFrame([[17, 95], [17.1, 95.1]]), null);
});

test('one bund quad per edge', () => {
  const frame = localFrame(BOX)!;
  const quads = bundStrip(frame.ring, 0.5);
  assert.equal(quads.length, 4);
  assert.ok(quads.every((q) => q.length === 4));
});

test('the trench ring stays inside the field', () => {
  const frame = localFrame(BOX)!;
  const inner = insetRing(frame.ring, 1.0);
  assert.equal(inner.length, 4);
  assert.ok(inner.every((p) => inside(p, frame.ring)));
  assert.ok(ringArea(inner) < ringArea(frame.ring));
});

test('satellite tiles for the small box are high zoom and few', () => {
  const t = tilesFor({ minLat: 17.097815, minLon: 95.180805, maxLat: 17.098185, maxLon: 95.181195 });
  assert.ok(t.z >= 18, `zoom ${t.z}`);
  assert.ok(t.tiles.length <= 16 && t.tiles.length >= 1);
});

test('plants are placed inside the field and outside the trench band', () => {
  const frame = localFrame(BOX)!;
  const trench = insetRing(frame.ring, 2.0);
  const band = { outer: insetRing(frame.ring, 1.0), inner: trench };
  const pts = plantGrid(frame.ring, 2.0, [band]);
  assert.ok(pts.length > 100);
  assert.ok(pts.every((p) => inside(p, frame.ring)));
  assert.ok(pts.every((p) => !(inside(p, band.outer) && !inside(p, band.inner))));
});

import { isPlaceholderTile } from '../../src/features/farm-simulation/lib/fieldsim/imagery.ts';

function pixels(fn: (i: number) => [number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < 32 * 32; i++) {
    const [r, g, b] = fn(i);
    out.set([r, g, b, 255], i * 4);
  }
  return out;
}

test('a uniform grey tile with a little white text is a placeholder', () => {
  assert.equal(isPlaceholderTile(pixels((i) => (i % 50 === 0 ? [255, 255, 255] : [203, 203, 203]))), true);
});

test('real imagery with varied colour is not a placeholder', () => {
  assert.equal(isPlaceholderTile(pixels((i) => [60 + (i * 7) % 90, 90 + (i * 13) % 80, 40 + (i * 5) % 60])), false);
});

test('a zoom cap lowers the tile zoom', () => {
  const box = { minLat: 17.097815, minLon: 95.180805, maxLat: 17.098185, maxLon: 95.181195 };
  assert.equal(tilesFor(box, 16, 16).z <= 16, true);
  assert.equal(tilesFor(box, 16, 19).z >= 18, true);
});
