import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUND_PIXELS, groundSpanMeters, hasLocation, locationLabel, zoomForSpan } from '../../src/features/farm-simulation/lib/ground/groundSpan.ts';

test('Ground: the snapshot zoom puts the whole ground plane span into the snapshot width', () => {
  const lat = 16.7426;
  const span = groundSpanMeters();
  const zoom = zoomForSpan(lat, span);
  const metersPerPixel = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  assert.ok(Math.abs(metersPerPixel * GROUND_PIXELS - span) < 1e-6);
  assert.ok(zoom > 14 && zoom < 16);
  assert.ok(zoomForSpan(0, span) > zoomForSpan(45, span));
});

test('Ground: only real coordinates count as a location, and they are labelled with hemispheres', () => {
  assert.equal(hasLocation({ lat: 16.74, lon: 95.58 }), true);
  assert.equal(hasLocation({}), false);
  assert.equal(hasLocation({ lat: 120, lon: 10 }), false);
  assert.equal(locationLabel(16.7426, 95.5842), '16.743° N, 95.584° E');
  assert.equal(locationLabel(-8.9917, 125.2197), '8.992° S, 125.220° E');
});
