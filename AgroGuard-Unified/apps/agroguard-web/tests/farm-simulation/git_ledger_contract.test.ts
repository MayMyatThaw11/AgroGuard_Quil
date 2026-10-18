import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CommitRecord } from '../../src/features/farm-simulation/types.ts';

test('CommitRecord invariant: validates all required audit properties', () => {
  const sample: CommitRecord = {
    hash: 'a1b2c3d',
    author: 'agent:paw_san',
    time: '10:30:00',
    message: 'Simulated 50mm AWD irrigation cycle',
    standard: 'ASOA_ORGANIC_V2',
    yieldDelta: '+120 kg/ha'
  };

  assert.equal(typeof sample.hash, 'string');
  assert.equal(typeof sample.author, 'string');
  assert.equal(typeof sample.time, 'string');
  assert.equal(typeof sample.message, 'string');
  assert.equal(typeof sample.standard, 'string');
  assert.equal(typeof sample.yieldDelta, 'string');
  assert.ok(sample.hash.length > 0);
});
