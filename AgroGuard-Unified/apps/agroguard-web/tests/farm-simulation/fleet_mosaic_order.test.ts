import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mosaicOrder, regionShares } from '../../src/features/farm-simulation/lib/fleetQuery.ts';

const rows = [
  { id: 'a', status: 'ok' },
  { id: 'b', status: 'alert' },
  { id: 'c', status: 'offline' },
  { id: 'd', status: 'watch' },
  { id: 'e', status: 'alert' },
] as const;

test('Fleet mosaic: risk view groups cells alert, watch, offline, on track and keeps order inside a group', () => {
  assert.deepEqual(mosaicOrder(rows, 'status').map((r) => r.id), ['b', 'e', 'd', 'c', 'a']);
});

test('Fleet mosaic: water and NDVI views keep the original order', () => {
  assert.deepEqual(mosaicOrder(rows, 'water').map((r) => r.id), ['a', 'b', 'c', 'd', 'e']);
});

test('Fleet mosaic: region shares add up to 100 and follow the same order', () => {
  const shares = regionShares(rows);
  assert.deepEqual(shares.map((s) => s.status), ['alert', 'watch', 'offline', 'ok']);
  assert.equal(shares.reduce((sum, s) => sum + s.pct, 0), 100);
  assert.deepEqual(shares.map((s) => s.count), [2, 1, 1, 1]);
});
