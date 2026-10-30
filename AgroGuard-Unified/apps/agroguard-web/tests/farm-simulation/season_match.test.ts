import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, type Key, type Vars } from '../../src/features/farm-simulation/lib/i18n.ts';
import {
  BUYER_NEEDS,
  BUYER_OFFERS,
  buyerRecordText,
  defaultReserveKg,
  farmerRecordText,
  monthsLabel,
  priceText,
  progressPct,
  reasonText,
  toggle,
  type Reason,
  type SeasonMatch,
} from '../../src/features/farm-simulation/lib/farmmap/seasonMatch.ts';

const t = (key: Key, vars?: Vars) => translate('en', key, vars);
const fine = (text: string) => assert.ok(!/[{}]/.test(text) && text.length > 3, text);

test('every reason id renders a sentence with no placeholder left', () => {
  const reasons: Reason[] = [
    { id: 'location', params: { km: 12.5 } },
    { id: 'area', params: { kg: 12500, share_pct: 100 } },
    { id: 'price', params: { pct: 6 } },
    { id: 'demand', params: { from: 'glut', to: 'short' } },
    ...[...BUYER_OFFERS.filter((o) => o !== 'provides-crates'), ...BUYER_NEEDS.filter((n) => n !== 'exact-date')].map(
      (by): Reason => ({ id: 'needs-met', params: { need: 'x', by } }),
    ),
  ];
  assert.equal(reasons.length, 4 + 6);
  reasons.forEach((r) => fine(reasonText(r, t, 'en')));
  assert.match(reasonText(reasons[0], t, 'en'), /12\.5 km/);
  assert.match(reasonText(reasons[1], t, 'en'), /12,500 kg/);
});

test('price text covers fixed, floor, town plus and no price', () => {
  assert.equal(priceText({ kind: 'fixed', mmk_kg: 1900 }, t, 'en'), '1,900 MMK per kg, fixed');
  assert.equal(priceText({ kind: 'floor', mmk_kg: 1500 }, t, 'en'), 'At least 1,500 MMK per kg');
  assert.equal(priceText({ kind: 'town-plus', plus_pct: 5 }, t, 'en'), 'Town price plus 5 percent');
  assert.equal(priceText({ kind: 'fixed' }, t, 'en'), 'Price on agreement');
});

test('reliability lines: a new buyer has no record, never a zero score', () => {
  const base = { orders: 8, completed: 7, cancelled: 0, median_days_to_pay: 3, new: false };
  assert.equal(buyerRecordText({ ...base, orders: 0, completed: 0, median_days_to_pay: null, new: true }, t), 'New buyer, no record yet.');
  assert.equal(buyerRecordText(base, t), 'Completed 7 of 8 season orders. Usually pays in 3 days.');
  assert.match(buyerRecordText({ ...base, median_days_to_pay: null }, t), /No payment record yet/);
  assert.equal(farmerRecordText({ delivered: 0, on_time: 0 }, t), 'No deliveries yet.');
  assert.equal(farmerRecordText({ delivered: 4, on_time: 3 }, t), 'Delivered 4 orders, 3 on time.');
});

test('progress is a percent of the target, capped, and zero without a target', () => {
  assert.equal(progressPct(2500, 10000), 25);
  assert.equal(progressPct(12000, 10000), 100);
  assert.equal(progressPct(5, 0), 0);
});

test('toggle adds and removes an id without changing the input', () => {
  const list = ['a'];
  assert.deepEqual(toggle(list, 'b'), ['a', 'b']);
  assert.deepEqual(toggle(list, 'a'), []);
  assert.deepEqual(list, ['a']);
});

test('months label lists short month names in order', () => {
  assert.equal(monthsLabel([3, 4], 'en'), 'Mar, Apr');
});

test('default reserve is the land estimate, never more than what is left', () => {
  const match = (remaining: number, kg?: number) =>
    ({ remaining_kg: remaining, reasons: kg === undefined ? [] : [{ id: 'area', params: { kg, share_pct: 50 } }] }) as unknown as SeasonMatch;
  assert.equal(defaultReserveKg(match(10000, 4000)), 4000);
  assert.equal(defaultReserveKg(match(3000, 4000)), 3000);
  assert.equal(defaultReserveKg(match(3000)), 3000);
});
