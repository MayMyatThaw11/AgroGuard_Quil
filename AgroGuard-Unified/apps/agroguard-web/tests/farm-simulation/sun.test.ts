import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightFor, sunAt } from '../../src/features/farm-simulation/lib/farmmap/sun.ts';

test('the sun is near the zenith at the equator on the March equinox at solar noon', () => {
  const sun = sunAt(0, 0, new Date('2026-03-20T12:00:00Z'));
  assert.ok(sun.elevationDeg > 85, `elevation ${sun.elevationDeg}`);
});

test('at solar noon in the northern tropics in October the sun is south of overhead', () => {
  const sun = sunAt(16.7, 95.6, new Date('2026-10-23T06:00:00Z'));
  assert.ok(sun.elevationDeg > 55 && sun.elevationDeg < 75, `elevation ${sun.elevationDeg}`);
  assert.ok(sun.azimuthDeg > 150 && sun.azimuthDeg < 210, `azimuth ${sun.azimuthDeg}`);
});

test('morning sun is in the east and afternoon sun in the west', () => {
  assert.ok(sunAt(16.7, 95.6, new Date('2026-10-23T00:30:00Z')).azimuthDeg < 120);
  assert.ok(sunAt(16.7, 95.6, new Date('2026-10-23T10:30:00Z')).azimuthDeg > 240);
});

test('night keeps a dim light, and day is brighter and white', () => {
  const night = lightFor(16.7, 95.6, new Date('2026-10-23T18:00:00Z'));
  const noon = lightFor(16.7, 95.6, new Date('2026-10-23T06:00:00Z'));
  assert.ok(night.intensity < 0.2 && night.position[2] === 90);
  assert.ok(noon.intensity > night.intensity && noon.color === '#ffffff');
});
