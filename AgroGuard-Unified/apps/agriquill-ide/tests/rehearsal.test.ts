import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Rehearsal } from '../src/data/ops/types.ts';
import { translate, type Key, type Vars } from '../src/lib/i18n.ts';
import { rehearsalLines } from '../src/lib/rehearsal.ts';

const branch = (p50: number[], first: number | null, below: number) => ({
  p10: p50.map((v) => v - 1),
  p50,
  p90: p50.map((v) => v + 1),
  days_below_floor: below,
  first_breach_day: first,
});

const REHEARSAL: Rehearsal = {
  dates: ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'],
  action_day: 1,
  target_cm: 5,
  floor_cm: -15,
  lift_cm: 18,
  water_m3: 3600,
  branches: {
    hold: branch([-11, -13, -15, -17], 2, 2),
    act: branch([-11, 5, 3, 1], null, 0),
    dry: branch([-11, 4, 2, -0.5], null, 0),
  },
  forecast_rain_mm: 15,
  status: 'design model, TO VERIFY on field data',
};

const en = (key: Key, vars?: Vars) => translate('en', key, vars);
const day = (iso: string) => iso.slice(5);

test('The rehearsal reads as three options, the water and an honest model note', () => {
  const lines = rehearsalLines(REHEARSAL, null, null, en, day);
  assert.deepEqual(
    lines.map((l) => l.id),
    ['act', 'hold', 'dry', 'water', 'design']
  );
  assert.equal(lines[0].text, 'If approved: above the -15 cm floor from 10-16 through 10-18.');
  assert.equal(lines[1].text, 'If not: at or below the -15 cm floor on 2 of 4 days, from 10-17.');
  assert.equal(lines[1].tone, 'act');
  assert.match(lines[3].text, /about 3600 m³/);
});

test('A dry season leads with the no-rain case and names its source', () => {
  const season = { town: 'Maubin, Ayeyarwady', spi_class: 'moderately dry', stress_weight: 'likely' as const };
  const lines = rehearsalLines(REHEARSAL, season, null, en, day);
  assert.deepEqual(lines.slice(0, 3).map((l) => l.id), ['act', 'dry', 'hold']);
  assert.ok(lines.some((l) => l.text.includes('moderately dry (CHIRPS SPI-3)')));
  assert.ok(lines.some((l) => l.id === 'likely'));
});

test('A scored job shows prediction against measurement and flags a job that did not run', () => {
  const outcome = {
    measured_cm: -14,
    predicted_cm: 3,
    error_cm: -17,
    inside_band: false,
    closer_to: 'hold' as const,
    observed_at: '2026-10-17T06:00:00+00:00',
  };
  const lines = rehearsalLines(REHEARSAL, null, outcome, en, day);
  assert.ok(lines.some((l) => l.text === 'After the job: predicted 3.0 cm, measured -14.0 cm, outside the band.'));
  assert.ok(lines.some((l) => l.id === 'not-run'));
});

test('The rehearsal translates', () => {
  const lines = rehearsalLines(REHEARSAL, null, null, (k, v) => translate('my', k, v), day);
  assert.match(lines[0].text, /အတည်ပြုလျှင်/);
});
