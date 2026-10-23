import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, BusyError } from '../../src/features/farm-simulation/lib/apiError.ts';
import { runBlock } from '../../src/features/farm-simulation/lib/quota.ts';

test('a 402 blocks the run whether or not a token is stored', () => {
  const err = new ApiError('{"code":"farm_limit_reached"}', 402, 'farm_limit_reached');
  assert.equal(runBlock(err, true), 'limit');
  assert.equal(runBlock(err, false), 'limit');
});

test('a 401 asks for sign-in only when there is no AgroGuard token', () => {
  const err = new ApiError('sign in', 401);
  assert.equal(runBlock(err, false), 'sign-in');
  assert.equal(runBlock(err, true), null);
});

test('network failures, busy and server faults leave the replay to start', () => {
  assert.equal(runBlock(new TypeError('Failed to fetch'), true), null);
  assert.equal(runBlock(new BusyError(429, 3), true), null);
  assert.equal(runBlock(new ApiError('boom', 500), true), null);
  assert.equal(runBlock(new ApiError('plan check unavailable', 503), true), null);
});
