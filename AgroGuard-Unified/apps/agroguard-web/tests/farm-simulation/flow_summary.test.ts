import assert from 'node:assert/strict';
import test from 'node:test';
import type { FarmFlows, ParcelFlows } from '../../src/features/farm-simulation/lib/api.ts';
import { flowSummary } from '../../src/features/farm-simulation/lib/farmmap/flowSummary.ts';

const parcel = (id: string, perc: number | null, bound = 'ponded'): ParcelFlows => ({
  id,
  stage: 'Tillering',
  water: {
    total: { rain_mm: 20, transpiration_mm: 25, evaporation_mm: 3, percolation_mm: perc },
    net_mm: perc === null ? null : 20 - 28 - perc,
    unknown: [],
    method: 'test',
    days: [{ date: '2026-10-23', evaporation_bound: bound }],
  },
  methane: { kg_ha: 68.4, range_kg_ha: [30.5, 148.9], saved_vs_flooding_kg_ha: 56, regime: 'AWD', season_days: 102, source: 'IPCC' },
});

const flows = (parcels: ParcelFlows[]): FarmFlows => ({
  farm_id: 'f',
  status: 'OK',
  days: [
    { date: '2026-10-23', et0_mm: 4, canopy: { vpd_kpa_mean: 0.7, vpd_kpa_max: 1.9, wet_hours: 10, wet_rule: '' } },
    { date: '2026-10-24', et0_mm: 4, canopy: { vpd_kpa_mean: 0.6, vpd_kpa_max: 1.8, wet_hours: 13, wet_rule: '' } },
  ],
  parcels,
});

test('mm over each field area become farm cubic metres, 10 per mm per hectare', () => {
  const out = flowSummary(flows([parcel('a', 21), parcel('b', 21)]), { a: 1, b: 0.5 });
  assert.ok(out);
  assert.equal(out.inflow[0].m3, 300);
  assert.deepEqual(out.outflow.map((t) => t.m3), [375, 45, 315]);
  assert.equal(out.netM3, 300 - 735);
  assert.equal(out.methane?.farmKg, Math.round(68.4 * 1.5));
  assert.equal(out.wettestDay?.date, '2026-10-24');
  assert.equal(out.evaporationUpperBound, false);
});

test('a missing percolation rate leaves that term and the balance unknown', () => {
  const out = flowSummary(flows([parcel('a', null, 'upper bound: drying soil not modelled')]), { a: 2 });
  assert.equal(out?.outflow[2].m3, null);
  assert.equal(out?.netM3, null);
  assert.equal(out?.evaporationUpperBound, true);
});

test('no field area means no farm totals at all', () => {
  assert.equal(flowSummary(flows([parcel('a', 21)]), { a: null }), null);
  assert.equal(flowSummary(null, {}), null);
});

test('nitrogen totals are area-weighted and absent when nothing was logged', () => {
  const withN = (id: string): ParcelFlows => ({
    ...parcel(id, 21),
    nitrogen: { applied_kg_n_ha: 60, volatilised_kg_n_ha: 9, leached_kg_n_ha: 14.4, n2o_direct_kg_n_ha: 0.3, n2o_indirect_kg_n_ha: 0.28, remaining_kg_n_ha: 36.3, not_counted: 0, not_counted_reason: null, source: 'IPCC' },
  });
  const out = flowSummary(flows([withN('a')]), { a: 2 });
  assert.deepEqual(out?.nitrogen, { appliedKg: 120, airKg: 18, waterKg: 28.8, n2oKg: 1.2, notCounted: 0 });
  assert.equal(flowSummary(flows([parcel('a', 21)]), { a: 2 })?.nitrogen, null);
});
