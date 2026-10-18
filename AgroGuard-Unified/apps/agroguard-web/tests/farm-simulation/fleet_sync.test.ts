import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFleet } from '../../src/features/farm-simulation/data/fleet/fleetFields.ts';
import { fieldStatus } from '../../src/features/farm-simulation/lib/fleetQuery.ts';
import { compareWithBackend, type RemoteField } from '../../src/features/farm-simulation/lib/fleetSync.ts';

const SAFE = -15;

function remoteOf(count: number): RemoteField[] {
  return getFleet().fields.slice(0, count).map((field) => ({
    id: field.id,
    water_cm: field.water,
    lowest_ahead_cm: field.low,
    ndvi: field.ndvi,
    offline: field.offline,
    status: fieldStatus(field, SAFE),
  }));
}

test('Fleet sync: 100 backend fields that mirror the local fixture all match', () => {
  const result = compareWithBackend(getFleet().fields, remoteOf(100), SAFE);
  assert.equal(result.checked, 100);
  assert.equal(result.matched, 100);
  assert.deepEqual(result.mismatched, []);
});

test('Fleet sync: a changed reading or an unknown id is reported by id', () => {
  const remote = remoteOf(100);
  remote[3] = { ...remote[3], water_cm: remote[3].water_cm + 1 };
  remote[7] = { ...remote[7], id: 'ZZ-9999' };
  const result = compareWithBackend(getFleet().fields, remote, SAFE);
  assert.equal(result.matched, 98);
  assert.deepEqual(result.mismatched, [remote[3].id, 'ZZ-9999']);
});

test('Fleet sync: a different safe depth changes the expected status', () => {
  const result = compareWithBackend(getFleet().fields, remoteOf(100), -5);
  assert.ok(result.mismatched.length > 0);
});
