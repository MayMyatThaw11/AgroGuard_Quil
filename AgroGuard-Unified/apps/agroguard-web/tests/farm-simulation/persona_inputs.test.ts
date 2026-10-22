import assert from 'node:assert/strict';
import test from 'node:test';
import { personaVariations, reasonText } from '../../src/features/farm-simulation/lib/farmmap/personaInputs.ts';

const base = { crew: '2', budget: '', inflation: '', prices: {}, handHours: {}, machines: ['T-01'] };

test('two variations share crew, budget and prices, and only tech names machines', () => {
  const out = personaVariations({ ...base, budget: '60,000', inflation: '8', prices: { irrigate: '3000', scout: '' } });
  assert.ok(Array.isArray(out));
  const [manual, tech] = out;
  assert.equal(manual.persona, 'manual');
  assert.equal(manual.machines, undefined);
  assert.deepEqual(tech.machines, ['T-01']);
  assert.equal(tech.budget, 60000);
  assert.deepEqual(tech.unit_prices, { irrigate: 3000 });
  assert.equal(tech.inflation_pct, 8);
});

test('empty budget and prices stay null instead of zero', () => {
  const out = personaVariations(base);
  assert.ok(Array.isArray(out));
  assert.equal(out[0].budget, null);
  assert.deepEqual(out[0].unit_prices, {});
});

test('bad inputs are explained, never sent', () => {
  assert.match(String(personaVariations({ ...base, crew: '0' })), /Crew/);
  assert.match(String(personaVariations({ ...base, crew: '2.5' })), /Crew/);
  assert.match(String(personaVariations({ ...base, budget: '-1' })), /Budget/);
  assert.match(String(personaVariations({ ...base, inflation: 'lots' })), /Price rise/);
  assert.match(String(personaVariations({ ...base, prices: { spray: 'x' } })), /spray/);
});

test('hand hours go to the by-hand plan only and are range checked', () => {
  const out = personaVariations({ ...base, handHours: { harvest: '40' } });
  assert.ok(Array.isArray(out));
  assert.deepEqual(out[0].durations_h, { harvest: 40 });
  assert.equal(out[1].durations_h, undefined);
  assert.match(String(personaVariations({ ...base, handHours: { harvest: '0.1' } })), /harvest by hand/);
});

test('blocked reasons read as plain words and keep unknown codes as they are', () => {
  assert.equal(reasonText('NO_GATE_WINDOW:daylight'), 'no allowed hours: not enough daylight hours in a row');
  assert.equal(reasonText('NO_GATE_WINDOW:wind:6.3 m/s over 5.5'), 'no allowed hours: wind too strong');
  assert.equal(reasonText('BUDGET: dropped as the lowest-priority job (low)'), 'dropped as the lowest-priority job (low)');
  assert.equal(reasonText('SOMETHING_NEW'), 'SOMETHING_NEW');
  assert.equal(reasonText(null), 'no reason given');
});
