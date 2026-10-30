import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEM_ERROR_M, fieldHeights, floodBasis, floodClass, waterLevelM, waterSceneY } from '../../src/features/farm-simulation/lib/farmview/flood.ts';

test('Flood: water sits at an absolute level, placed against the scene origin height', () => {
  assert.equal(waterSceneY(3, 5), -2);
  assert.equal(waterSceneY(12, 5), 7);
});

test('Flood: sea basis starts at mean sea level; river basis at the lowest nearby ground', () => {
  assert.equal(waterLevelM('sea', 1.5, 40), 1.5);
  assert.equal(waterLevelM('river', 1.5, 40), 41.5);
});

test('Flood: low fields default to sea level, higher fields to the river', () => {
  assert.equal(floodBasis(4), 'sea');
  assert.equal(floodBasis(60), 'river');
  assert.equal(floodBasis(null), 'river');
});

test('Flood: ground well above the water stays dry, ground well below goes under, the error band is "may"', () => {
  const field = { min: 4, median: 5, max: 6 };
  assert.equal(floodClass(field, 0.5, 2), 'dry');
  assert.equal(floodClass(field, 3, 2), 'may');
  assert.equal(floodClass(field, 9, 2), 'likely');
});

test('Flood: field heights come from the DEM samples inside the field', () => {
  assert.deepEqual(fieldHeights([7, 3, 5, null, 4]), { min: 3, median: 4.5, max: 7 });
  assert.equal(fieldHeights([null, null]), null);
});

test('Flood: the DEM error is the TO VERIFY default of 30 m terrain tiles', () => {
  assert.ok(DEM_ERROR_M > 0);
});
