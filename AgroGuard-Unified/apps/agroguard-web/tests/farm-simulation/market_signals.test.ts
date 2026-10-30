import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, type Key, type Vars } from '../../src/features/farm-simulation/lib/i18n.ts';
import { checkText, kgText, plantText, readyText, type PlantIdea } from '../../src/features/farm-simulation/lib/farmmap/marketSignals.ts';

const t = (key: Key, vars?: Vars) => translate('en', key, vars);
const w = (kg: number) => `${kg} kg`;
const miss = { field: 'ready_on', reason: 'unknown' };

test('ready text names its source and is silent when the date is unknown', () => {
  assert.equal(readyText({ date: '2027-03-15', source: 'season-plan' }, t, 'en'), 'Ready about Mar 15, from your season plan.');
  assert.equal(readyText({ date: '2027-03-15', source: 'profile-month' }, t, 'en'), 'Ready about Mar 15, from your harvest month.');
  assert.equal(readyText(miss, t, 'en'), null);
});

test('expected kg names its source in words', () => {
  assert.match(kgText({ kg: 2100, source: 'fao-official' }, t, w) ?? '', /2100 kg expected, from the FAO official yield/);
  assert.match(kgText({ kg: 2100, source: 'national-range' }, t, w) ?? '', /national yield range/);
  assert.match(kgText({ kg: 2100, source: 'typical-yield' }, t, w) ?? '', /To verify/);
  assert.equal(kgText(miss, t, w), null);
});

test('the gap check asks, never blocks, and is silent without a check', () => {
  assert.equal(checkText({ expected_kg: 2100 }, 4000, t, w), 'Your estimate is about 2100 kg. Is 4000 kg right?');
  assert.equal(checkText(null, 4000, t, w), null);
});

test('plant idea says part of the land, with the demand', () => {
  const idea: PlantIdea = { produce: 'chili', agronomy_fit: 'suitable', demand_kg: 8000, share: 'part' };
  assert.equal(plantText(idea, t, w, 'Chili'), 'Chili suits your land and buyers want 8000 kg. Plant only part of your land.');
});
