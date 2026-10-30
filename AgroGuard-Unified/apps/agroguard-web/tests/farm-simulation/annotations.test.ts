import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acres, centroid, edgeMarks, fieldFacts, orientedBox, perimeter } from '../../src/features/farm-simulation/lib/farmview/annotations.ts';
import type { XZ } from '../../src/features/farm-simulation/lib/fieldsim/localFrame.ts';

const rect = (w: number, h: number, x = 0, z = 0): XZ[] => [[x, z], [x + w, z], [x + w, z + h], [x, z + h]];

test('Annotations: a 100 by 50 m field is 0.5 ha with a 300 m edge', () => {
  const facts = fieldFacts(rect(100, 50));
  assert.equal(facts.areaHa, 0.5);
  assert.equal(facts.perimeterM, 300);
  assert.equal(facts.lengthM, 100);
  assert.equal(facts.widthM, 50);
});

test('Annotations: the size box follows a turned field, not the map axes', () => {
  const c = Math.cos(Math.PI / 6);
  const s = Math.sin(Math.PI / 6);
  const turned = rect(120, 40).map(([x, z]): XZ => [x * c - z * s, x * s + z * c]);
  const facts = fieldFacts(turned);
  assert.ok(Math.abs(facts.lengthM - 120) < 0.01);
  assert.ok(Math.abs(facts.widthM - 40) < 0.01);
  assert.ok(Math.abs(facts.areaHa - 0.48) < 1e-6);
});

test('Annotations: a ring that closes on its first point is not counted twice', () => {
  const open = rect(60, 60);
  const closed: XZ[] = [...open, open[0]];
  assert.equal(perimeter(closed), perimeter(open));
  assert.equal(fieldFacts(closed).areaHa, fieldFacts(open).areaHa);
});

test('Annotations: short edges get no label and long edges get one at their middle', () => {
  const marks = edgeMarks([[0, 0], [100, 0], [100, 6], [0, 6]], 15);
  assert.equal(marks.length, 2);
  assert.deepEqual(marks[0].mid, [50, 0]);
  assert.equal(marks[0].lengthM, 100);
});

test('Annotations: edge labels sit outside the field', () => {
  const [bottom] = edgeMarks(rect(100, 50), 15);
  assert.ok(bottom.outward[0] === 0 && Math.abs(bottom.outward[1]) === 1);
  const out = [bottom.mid[0] + bottom.outward[0] * 5, bottom.mid[1] + bottom.outward[1] * 5];
  assert.ok(out[1] < 0, 'the first edge runs along z = 0, so outside is negative z');
});

test('Annotations: acres follow the 0.40468564 ha factor and the centroid is the middle', () => {
  assert.ok(Math.abs(acres(1) - 2.4710538) < 1e-4);
  assert.deepEqual(centroid(rect(100, 50, 10, 20)), [60, 45]);
});

test('Annotations: a ring with fewer than 3 points has no area', () => {
  assert.equal(fieldFacts([[0, 0], [5, 5]]).areaHa, 0);
});

test('Annotations: the oriented box of a turned footprint has the footprint size, the middle and the long-side angle', () => {
  const c = Math.cos(Math.PI / 6);
  const s = Math.sin(Math.PI / 6);
  const turned = rect(20, 8, 5, 5).map(([x, z]): XZ => [x * c - z * s, x * s + z * c]);
  const box = orientedBox(turned);
  assert.ok(Math.abs(box.length - 20) < 1e-6 && Math.abs(box.width - 8) < 1e-6);
  assert.ok(Math.abs(box.angle - Math.PI / 6) < 1e-6);
  const middle = [15 * c - 9 * s, 15 * s + 9 * c];
  assert.ok(Math.abs(box.centre[0] - middle[0]) < 1e-6 && Math.abs(box.centre[1] - middle[1]) < 1e-6);
});

test('Annotations: fill is the share of the oriented box a footprint covers', () => {
  assert.ok(Math.abs(orientedBox(rect(20, 8)).fill - 1) < 1e-9);
  const ell: XZ[] = [[0, 0], [20, 0], [20, 4], [8, 4], [8, 8], [0, 8]];
  assert.ok(orientedBox(ell).fill < 0.8);
});
