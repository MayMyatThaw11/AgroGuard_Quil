import assert from 'node:assert/strict';
import test from 'node:test';
import type { FarmSeasons, SeasonKey } from '../../src/features/farm-simulation/lib/api.ts';
import { seasonLine, span } from '../../src/features/farm-simulation/lib/farmmap/seasonText.ts';

const delta: SeasonKey[] = ['cool_dry', 'cool_dry', 'hot_dry', 'hot_dry', 'rainy', 'rainy', 'rainy', 'rainy', 'rainy', 'rainy', 'cool_dry', 'cool_dry'];

const seasons = (labels: SeasonKey[], now: FarmSeasons['now'], extra: Partial<FarmSeasons> = {}): FarmSeasons => ({
  farm_id: 'f',
  months: labels.map((season, i) => ({ month: i + 1, rain_mm: 0, t_c: 0, season, label: season })),
  runs: [],
  now,
  month: 7,
  rule: 'Peel 2007',
  ...extra,
});

test('the line names the season now, when it ends and what comes next', () => {
  const data = seasons(delta, { season: 'rainy', label: 'Rainy', until_month: 10, next: { season: 'cool_dry', from: 11, to: 2 } });
  assert.equal(seasonLine(data), 'Rainy now, until Oct · next cool dry (winter) Nov–Feb');
});

test('a place with no dry month reads as wet all year with its wettest months', () => {
  const data = seasons(Array(12).fill('rainy'), { season: 'rainy', label: 'Rainy', until_month: 12, next: null }, { wet_all_year: true, wettest_months: [12, 1, 11] });
  assert.equal(seasonLine(data), 'Wet all year · wettest Dec, Jan, Nov');
});

test('unknown normals give no line, and a one-month run is a single month', () => {
  assert.equal(seasonLine({ ...seasons(delta, null), months: null }), null);
  assert.equal(span({ from: 3, to: 3 }), 'Mar');
});
