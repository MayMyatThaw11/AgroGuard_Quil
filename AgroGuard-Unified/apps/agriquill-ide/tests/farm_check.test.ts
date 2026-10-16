import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FarmCheck } from '../src/data/ops/types.ts';
import { farmCheckLines } from '../src/lib/farmCheck.ts';

function application(n: number, flags: string[]) {
  return {
    applied_at: `2026-09-0${n}T09:00:00+00:00`,
    local_time: `2026-09-0${n} 15:30`,
    field: 'North-field',
    product: `Product ${n}`,
    kind: 'spray',
    flags,
  };
}

const FULL: FarmCheck = {
  farm_id: 'f',
  backtest: {
    status: 'OK',
    overall: { pairs: 24, model_mae_cm: 0.4321, no_change_mae_cm: 1.25 },
    seepage_mm_day: { median: 3.04, pairs: 6, reason: null },
    fields: [{ percolation_mm_day: 4 }],
    missing: [],
  },
  spray_recent: { status: 'OK', days: 30, days_without_safe_hour: 4 },
  inputs: {
    status: 'OK',
    applications: [
      application(1, []),
      application(2, ['unsafe weather', 'second flag']),
      application(3, ['banned']),
      application(4, ['one']),
      application(5, ['two']),
    ],
    missing: [],
  },
};

test('Farm check: a full check reads as four findings with rounded numbers', () => {
  const lines = farmCheckLines(FULL);
  assert.deepEqual(lines.slice(0, 4), [
    {
      label: 'Water model',
      text: "AgriQill off by 0.4 cm on average vs 1.3 cm for 'no change', over 24 reading pairs",
      tone: 'ok',
    },
    { label: 'Seepage', text: 'measured 3 mm/day on dry days (contract assumes 4)', tone: 'ok' },
    { label: 'Spray safety', text: '4 of 30 days in the last 30 had no safe spraying hour', tone: 'warn' },
    { label: 'Records', text: '5 spray and fertiliser records, 4 flagged', tone: 'warn' },
  ]);
  const flagged = lines.slice(4);
  assert.equal(flagged.length, 3);
  assert.equal(flagged[0].text, '2026-09-02 North-field Product 2: unsafe weather');
});

test('Farm check: a model that loses to no change is a warning', () => {
  const worse: FarmCheck = {
    ...FULL,
    backtest: { ...FULL.backtest, overall: { pairs: 24, model_mae_cm: 2, no_change_mae_cm: 1 } },
  };
  assert.equal(farmCheckLines(worse)[0].tone, 'warn');
});

test('Farm check: missing readings and records show their reasons', () => {
  const empty: FarmCheck = {
    farm_id: 'f',
    backtest: {
      status: 'NO_READINGS',
      missing: [{ field: 'water_depth', reason: 'no field has two readings; import the sheet' }],
    },
    spray_recent: {
      status: 'NO_WEATHER',
      missing: [{ field: 'weather', reason: 'archive unavailable' }],
    },
    inputs: {
      status: 'NO_INPUTS',
      applications: [],
      missing: [{ field: 'inputs', reason: 'no spray or fertiliser records; import the inputs sheet' }],
    },
  };
  assert.deepEqual(farmCheckLines(empty), [
    { label: 'Water model', text: 'no field has two readings; import the sheet', tone: 'missing' },
    { label: 'Spray safety', text: 'archive unavailable', tone: 'missing' },
    { label: 'Records', text: 'no spray or fertiliser records; import the inputs sheet', tone: 'missing' },
  ]);
});

test('Farm check: fewer than 10 pairs is called a first look', () => {
  const few: FarmCheck = {
    ...FULL,
    backtest: { ...FULL.backtest, overall: { pairs: 3, model_mae_cm: 0.2, no_change_mae_cm: 1 } },
  };
  const lines = farmCheckLines(few);
  assert.equal(lines[0].tone, 'warn');
  assert.equal(lines[1].text, 'only 3 pairs: a first look');
  assert.equal(farmCheckLines(FULL).some((l) => l.text.includes('first look')), false);
});

test('Farm check: records checked without weather say the weather check did not run', () => {
  const noWeather: FarmCheck = {
    ...FULL,
    inputs: {
      status: 'NO_WEATHER',
      applications: [application(1, [])],
      missing: [{ field: 'weather', reason: 'archive unavailable' }],
    },
  };
  const records = farmCheckLines(noWeather).filter((l) => l.label === 'Records');
  assert.deepEqual(records, [
    { label: 'Records', text: '1 spray and fertiliser record, 0 flagged', tone: 'ok' },
    { label: 'Records', text: 'weather check did not run: archive unavailable', tone: 'warn' },
  ]);
});

test('Farm check: a missing nitrogen cap shows as a warning under Records', () => {
  const noCap: FarmCheck = {
    ...FULL,
    inputs: { ...FULL.inputs, missing: [{ field: 'nitrogen_cap', reason: 'contract declares no nitrogen cap' }] },
  };
  assert.ok(
    farmCheckLines(noCap).some((l) => l.text === 'contract declares no nitrogen cap' && l.tone === 'warn')
  );
});

test('Farm check: a flagged record without a farm-local time is dated in UTC', () => {
  const utc: FarmCheck = {
    ...FULL,
    inputs: { ...FULL.inputs, applications: [{ ...application(2, ['banned']), local_time: null }] },
  };
  const flagged = farmCheckLines(utc).filter((l) => l.label === 'Flagged');
  assert.equal(flagged[0].text, '2026-09-02 UTC North-field Product 2: banned');
});

test('Farm check: every records gap shows, so the nitrogen lower bound is never hidden', () => {
  const gaps: FarmCheck = {
    ...FULL,
    inputs: {
      ...FULL.inputs,
      status: 'NO_WEATHER',
      missing: [
        { field: 'weather', reason: 'archive unavailable' },
        {
          field: 'North-field.nitrogen',
          reason: '1 fertiliser record not counted (1 without a rate or n_pct); the total is a lower bound',
        },
      ],
    },
  };
  const notes = farmCheckLines(gaps).filter((l) => l.label === 'Records').slice(1);
  assert.deepEqual(
    notes.map((l) => [l.text, l.tone]),
    [
      ['weather check did not run: archive unavailable', 'warn'],
      ['1 fertiliser record not counted (1 without a rate or n_pct); the total is a lower bound', 'warn'],
    ]
  );
});

test('Farm check: a standard without a banned-input list is a warning, not OK', () => {
  const unlisted: FarmCheck = {
    ...FULL,
    inputs: {
      status: 'OK',
      standard: 'JAS_ORGANIC',
      banned_checked: false,
      applications: [application(1, [])],
      missing: [],
    },
  };
  const records = farmCheckLines(unlisted).filter((l) => l.label === 'Records');
  assert.deepEqual(records, [
    { label: 'Records', text: '1 spray and fertiliser record, 0 flagged', tone: 'warn' },
    { label: 'Records', text: 'no banned-input list for JAS_ORGANIC', tone: 'warn' },
  ]);
  const listed: FarmCheck = { ...unlisted, inputs: { ...unlisted.inputs, standard: 'ASOA_ORGANIC', banned_checked: true } };
  assert.equal(farmCheckLines(listed).filter((l) => l.label === 'Records')[0].tone, 'ok');
});
