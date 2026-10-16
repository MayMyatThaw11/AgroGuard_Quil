import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContractSpec } from '../src/lib/contractFarm.ts';
import { demoField, fieldBounds, ledgerFact, paddyFeatures, svgPaddies, weatherLine } from '../src/lib/signinField.ts';

const CONTRACT: ContractSpec = {
  farm: { id: 'farm_demo', name: 'Delta Demo Cooperative', country: 'MM', location: [16.72834, 95.59059], standard: 'ASOA_ORGANIC' },
  parcels: [
    { id: 'PD-01', area_ha: 0.35, boundary: [[16.7308, 95.5975], [16.7309, 95.5982], [16.7305, 95.5984], [16.7308, 95.5975]] },
    { id: 'PD-02', area_ha: 0.4, boundary: [[16.7302, 95.5943], [16.7298, 95.5947], [16.7302, 95.5948], [16.7302, 95.5943]] },
    { id: 'PD-03', area_ha: null, boundary: null },
  ],
  assets: [],
};

test('demo field keeps only parcels with an outline and swaps to lon, lat', () => {
  const field = demoField(CONTRACT);
  assert.ok(field);
  assert.equal(field.name, 'Delta Demo Cooperative');
  assert.deepEqual(field.location, [95.59059, 16.72834]);
  assert.deepEqual(field.paddies.map((p) => p.id), ['PD-01', 'PD-02']);
  assert.deepEqual(field.paddies[0].ring[0], [95.5975, 16.7308]);
  assert.equal(field.areaHa, 0.75);
  assert.equal(demoField(null), null);
});

test('area is unknown, not zero, when no parcel states one', () => {
  const field = demoField({ ...CONTRACT, parcels: [{ id: 'X', area_ha: null }] });
  assert.equal(field?.areaHa, null);
  assert.equal(field?.paddies.length, 0);
  assert.equal(fieldBounds(field?.paddies ?? []), null);
});

test('bounds and features cover every outline', () => {
  const field = demoField(CONTRACT);
  assert.ok(field);
  assert.deepEqual(fieldBounds(field.paddies), { west: 95.5943, south: 16.7298, east: 95.5984, north: 16.7309 });
  const features = paddyFeatures(field.paddies);
  assert.equal(features.features.length, 2);
  assert.equal(features.features[1].properties.id, 'PD-02');
});

test('svg outlines fit inside the box with the padding kept', () => {
  const field = demoField(CONTRACT);
  assert.ok(field);
  const shapes = svgPaddies(field.paddies, 400, 300, 20);
  assert.equal(shapes.length, 2);
  for (const shape of shapes) {
    const numbers = shape.d.replace(/[MLZ]/g, ' ').trim().split(/\s+/).map(Number);
    for (let i = 0; i < numbers.length; i += 2) {
      assert.ok(numbers[i] >= 19.9 && numbers[i] <= 380.1, `x ${numbers[i]} inside`);
      assert.ok(numbers[i + 1] >= 19.9 && numbers[i + 1] <= 280.1, `y ${numbers[i + 1]} inside`);
    }
  }
  assert.deepEqual(svgPaddies([], 400, 300, 20), []);
});

test('weather line uses units, a true minus, and skips missing values', () => {
  assert.equal(
    weatherLine({ temp_min_degc: 24.7, temp_max_degc: 31.5, precipitation_mm: 3.4, wind_speed_max_ms: 3.861 }),
    '25–32 °C · rain 3.4 mm · wind up to 3.9 m/s',
  );
  assert.equal(weatherLine({ temp_min_degc: -2.4, temp_max_degc: 4, precipitation_mm: null }), '−2–4 °C');
  assert.equal(weatherLine({}), null);
  assert.equal(weatherLine(null), null);
});

test('ledger fact reports a failed chain plainly', () => {
  assert.deepEqual(ledgerFact({ valid: true, entries: new Array(1204).fill(0) }), { text: '1,204 records · chain verified', ok: true });
  assert.deepEqual(ledgerFact({ valid: false, entries: [1] }), { text: '1 record · chain check failed', ok: false });
});
