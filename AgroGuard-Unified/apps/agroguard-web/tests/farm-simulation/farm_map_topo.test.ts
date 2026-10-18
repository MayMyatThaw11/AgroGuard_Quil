import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landPolygons, type Topology } from '../../src/features/farm-simulation/lib/farmmap/topoLand.ts';

const square: Topology = {
  type: 'Topology',
  transform: { scale: [1, 1], translate: [100, 0] },
  arcs: [[[0, 0], [2, 0], [0, 2], [-2, 0], [0, -2]]],
  objects: { countries: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[0]] }] } },
};

test('Topo land: decodes delta arcs with the transform', () => {
  const polygons = landPolygons(square, 'countries');
  assert.equal(polygons.length, 1);
  assert.deepEqual(polygons[0][0], [[100, 0], [102, 0], [102, 2], [100, 2], [100, 0]]);
});

test('Topo land: reverses arcs referenced by their complement', () => {
  const reversed: Topology = {
    ...square,
    objects: { countries: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[~0]] }] } },
  };
  const ring = landPolygons(reversed, 'countries')[0][0];
  assert.deepEqual(ring[0], [100, 0]);
  assert.deepEqual(ring[1], [100, 2]);
});

test('Topo land: expands multipolygons and ignores unknown objects', () => {
  const multi: Topology = {
    ...square,
    objects: { countries: { type: 'GeometryCollection', geometries: [{ type: 'MultiPolygon', arcs: [[[0]], [[0]]] }] } },
  };
  assert.equal(landPolygons(multi, 'countries').length, 2);
  assert.deepEqual(landPolygons(multi, 'missing'), []);
});
