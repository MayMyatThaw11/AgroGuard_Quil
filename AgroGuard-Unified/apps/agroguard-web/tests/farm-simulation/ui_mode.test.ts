import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickMode } from '../../src/features/farm-simulation/lib/farmmap/uiMode.ts';

test('UI mode: an access code is a dev account', () => {
  assert.equal(pickMode({ accessCode: 'FARMSIM-2026', accountType: 'farmer', viewAs: null }).mode, 'dev');
});

test('UI mode: signed-in accounts follow their account type', () => {
  assert.equal(pickMode({ accessCode: '', accountType: 'buyer', viewAs: null }).mode, 'buyer');
  assert.equal(pickMode({ accessCode: '', accountType: 'farmer', viewAs: null }).mode, 'farmer');
  assert.equal(pickMode({ accessCode: '', accountType: 'dev', viewAs: null }).mode, 'dev');
});

test('UI mode: only dev accounts can view as another mode', () => {
  const dev = pickMode({ accessCode: 'x', accountType: 'farmer', viewAs: 'buyer' });
  assert.deepEqual(dev, { mode: 'dev', shown: 'buyer' });
  assert.deepEqual(pickMode({ accessCode: '', accountType: 'farmer', viewAs: 'buyer' }), { mode: 'farmer', shown: 'farmer' });
});
