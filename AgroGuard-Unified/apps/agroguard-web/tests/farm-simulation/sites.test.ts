import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProcessingSite } from '../../src/features/farm-simulation/lib/api.ts';
import { precisionKey, siteFeatures } from '../../src/features/farm-simulation/lib/farmmap/sites.ts';

const ring = [
  [95.1808, 17.0978],
  [95.1812, 17.0978],
  [95.1812, 17.0982],
  [95.1808, 17.0982],
  [95.1808, 17.0978],
];

const site = (id: string, precision: string): ProcessingSite => ({
  id,
  name: 'Test Mill A',
  properties: { id, name: 'Test Mill A', capacity_tons: '60-100', precision_level: precision },
  geometry: { type: 'Polygon', coordinates: [ring] },
  centroid: [17.098, 95.181],
  area_ha: 0.17,
  area_basis: 'computed from the uploaded outline',
  precision_level: precision,
  suppliers: [],
});

test('each site becomes an outline and a pin at its centroid', () => {
  const out = siteFeatures([site('a', 'ward_corridor_simulated_parcel'), site('b', 'surveyed')]);
  assert.equal(out.length, 4);
  assert.deepEqual(out.map((f) => f.geometry.type), ['Polygon', 'Point', 'Polygon', 'Point']);
  const pin = out[1];
  assert.ok(pin.geometry.type === 'Point');
  assert.deepEqual(pin.geometry.coordinates, [95.181, 17.098]);
  assert.deepEqual(pin.properties, { id: 'a', name: 'Test Mill A', kind: 'mill' });
});

test('a simulated parcel is labelled as not surveyed', () => {
  assert.equal(precisionKey('ward_corridor_simulated_parcel'), 'farmMap.site.simulated');
  assert.equal(precisionKey('surveyed_boundary'), 'farmMap.site.asUploaded');
});
