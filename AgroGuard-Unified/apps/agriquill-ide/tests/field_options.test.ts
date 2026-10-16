import assert from 'node:assert/strict';
import test from 'node:test';
import { fieldOptions, type FieldState } from '../src/lib/fieldOptions.ts';

const BASE: FieldState = { cropId: 'rice_lowland', stage: 'Tillering', waterCm: null, herdKinds: [], organic: false, sprayTasks: 0 };
const codes = (s: FieldState) => fieldOptions(s).map((o) => `${o.family}:${o.status}`);

test('a rice field with fish in it reports rice–fish as running and offers nothing new for fish', () => {
  assert.deepEqual(codes({ ...BASE, herdKinds: ['fish'], waterCm: 8 }), ['30:running', '36:running']);
});

test('a ripening rice field with no animals offers fish next crop and a succession crop', () => {
  assert.deepEqual(codes({ ...BASE, stage: 'Ripening' }), ['30:option', '7:option', '36:running']);
});

test('standing water is the evidence for a fish option; no water reading means no claim', () => {
  assert.ok(codes({ ...BASE, waterCm: 6 }).includes('30:option'));
  assert.ok(!codes({ ...BASE, waterCm: null }).includes('30:option'));
  assert.ok(!codes({ ...BASE, waterCm: -12 }).includes('30:option'));
});

test('a rice–shrimp contract without a shrimp herd is flagged, and organic plus sprays are reported', () => {
  const out = codes({ ...BASE, cropId: 'rice_shrimp', organic: true, sprayTasks: 2 });
  assert.deepEqual(out, ['19:watch', '34:running', '36:watch']);
});

test('ducks in a field link crops and livestock', () => {
  assert.ok(codes({ ...BASE, herdKinds: ['ducks'] }).includes('32:running'));
});
