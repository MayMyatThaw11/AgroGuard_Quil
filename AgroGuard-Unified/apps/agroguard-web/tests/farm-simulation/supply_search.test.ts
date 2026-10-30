import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, type Key, type Vars } from '../../src/features/farm-simulation/lib/i18n.ts';
import { basisText, bandTone, landedText, searchParams, type SupplyRow } from '../../src/features/farm-simulation/lib/farmmap/supplySearch.ts';

const t = (key: Key, vars?: Vars) => translate('en', key, vars);
const row = (extra: Partial<SupplyRow>): SupplyRow => ({
  id: 'l1', farm: 'Ko Aung', town: 'Hmawbi', qty_kg: 400, ready_on: '2027-03-15', km: 3,
  ask_mmk_kg: 1500, price_basis: 'ask', landed_low: 1518, landed_high: 1560, band: 'within', reliability: null, ...extra,
});

test('landed text is a range, one number when low equals high, and says when the price is unknown', () => {
  assert.equal(landedText(row({}), t, 'en'), '1,518 to 1,560 MMK per kg delivered');
  assert.equal(landedText(row({ landed_high: 1518 }), t, 'en'), '1,518 MMK per kg delivered');
  assert.equal(landedText(row({ landed_low: null, landed_high: null, price_basis: null }), t, 'en'), 'Price not known yet');
});

test('a reference price is labelled as not the farm price', () => {
  assert.equal(basisText(row({}), t, 'en'), 'The farm asks 1,500 MMK per kg');
  assert.match(basisText(row({ ask_mmk_kg: null, price_basis: 'reference', landed_low: 1900 }), t, 'en', 1800) ?? '', /reference and not the farm's price/);
  assert.equal(basisText(row({ price_basis: null, ask_mmk_kg: null }), t, 'en'), null);
});

test('band tones: within is accent, slightly over is a warning', () => {
  assert.equal(bandTone('within'), 'accent');
  assert.equal(bandTone('slightly-over'), 'warning');
  assert.equal(bandTone(null), 'neutral');
});

test('search params carry only what was filled in', () => {
  const q = searchParams({ produce: 'tomato', lat: 17.1, lon: 96.05, kg: 500, budget: '', radius: 50, by: '2027-03-20' });
  assert.equal(q.get('produce'), 'tomato');
  assert.equal(q.get('kg'), '500');
  assert.equal(q.get('radius_km'), '50');
  assert.equal(q.get('by'), '2027-03-20');
  assert.equal(q.has('budget'), false);
  assert.equal(searchParams({ produce: 'tomato', lat: 1, lon: 2, kg: 0, budget: '1200', radius: 50, by: '' }).get('budget'), '1200');
});
