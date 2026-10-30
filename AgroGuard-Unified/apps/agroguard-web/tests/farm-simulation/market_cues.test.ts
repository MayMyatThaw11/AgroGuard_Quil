import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, type Key, type Vars } from '../../src/features/farm-simulation/lib/i18n.ts';
import {
  cueText,
  loadCueState,
  prefillOffer,
  saveCueState,
  seasonText,
  showCue,
  type Cue,
} from '../../src/features/farm-simulation/lib/farmmap/marketCues.ts';
import type { Producer } from '../../src/features/farm-simulation/lib/farmmap/producers.ts';

const t = (key: Key, vars?: Vars) => translate('en', key, vars);
const w = (kg: number) => `${kg} kg`;

const profile = (crops: Producer['crops']): Pick<Producer, 'crops'> => ({ crops });

test('prefill: produce from the farm crop, kg from area times the yield midpoint, ready on the 15th of the harvest month', () => {
  const out = prefillOffer(profile([{ produce: 'tomato', harvest_month: 3, area_ha: 0.5 }]), 'veg', new Date(Date.UTC(2026, 10, 1)));
  assert.equal(out.produce, 'tomato');
  assert.equal(out.ready_on, '2027-03-15');
  assert.ok(out.kg !== null && out.kg > 0);
  const same = prefillOffer(profile([{ produce: 'tomato', harvest_month: 11, area_ha: 0.5 }]), 'veg', new Date(Date.UTC(2026, 10, 1)));
  assert.equal(same.ready_on, '2026-11-15');
  assert.equal(prefillOffer(profile([{ produce: 'rice', harvest_month: 11, area_ha: null }]), 'rice', new Date(Date.UTC(2026, 10, 1))).kg, null);
});

test('prefill picks the profile crop that fits the farm, else the first one', () => {
  const crops: Producer['crops'] = [
    { produce: 'rice', harvest_month: 11, area_ha: 1 },
    { produce: 'onion', harvest_month: 3, area_ha: 1 },
  ];
  assert.equal(prefillOffer(profile(crops), 'veg').produce, 'onion');
  assert.equal(prefillOffer(profile(crops), 'palm').produce, 'rice');
});

test('every cue kind renders a sentence with nothing left to fill in', () => {
  const cues: Cue[] = [
    { id: 'a', kind: 'harvest-soon', params: { produce: 'tomato', days: 12 }, issued_on: '2026-11-01' },
    { id: 'b', kind: 'new-buyers', params: { produce: 'tomato', n: 3 }, issued_on: '2026-11-01' },
    { id: 'c', kind: 'processor-posted', params: { produce: 'potato', n: 1 }, issued_on: '2026-11-01' },
    { id: 'd', kind: 'season-match', params: { n: 2 }, issued_on: '2026-11-01' },
    { id: 'e', kind: 'glut-at-planting', params: { produce: 'tomato', town: 'Hmawbi' }, issued_on: '2026-11-01' },
    { id: 'f', kind: 'supply-match', params: { produce: 'tomato', n: 4, kg: 4200 }, issued_on: '2026-11-01' },
  ];
  cues.forEach((c) => {
    const text = cueText(c, t, (p) => p, w);
    assert.ok(text.length > 8 && !/[{}]/.test(text), text);
  });
  assert.match(cueText(cues[0], t, (p) => p, w), /about 12 days/);
});

test('cues respect mute and the last seen day', () => {
  const cue: Cue = { id: 'a', kind: 'new-buyers', params: { produce: 'tomato', n: 1 }, issued_on: '2026-11-02' };
  assert.equal(showCue(cue, { muted: false, seenAt: null }), true);
  assert.equal(showCue(cue, { muted: true, seenAt: null }), false);
  assert.equal(showCue(cue, { muted: false, seenAt: '2026-11-02' }), false);
  assert.equal(showCue(cue, { muted: false, seenAt: '2026-11-01' }), true);
});

test('cue state survives storage and a broken store reads as the default', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  assert.deepEqual(loadCueState(storage), { muted: false, seenAt: null });
  saveCueState(storage, { muted: true, seenAt: '2026-11-02' });
  assert.deepEqual(loadCueState(storage), { muted: true, seenAt: '2026-11-02' });
  assert.deepEqual(loadCueState(null), { muted: false, seenAt: null });
});

test('season record says what was sold and how it compares with the town price', () => {
  const base = { sold_kg: 2940, avg_mmk_kg: 1900, town_avg_mmk_kg: 1850, deliveries: 2, on_time: 2 };
  assert.equal(seasonText(base, t, w), 'This season you sold 2940 kg at 1,900 MMK per kg, 50 MMK per kg above the town price.');
  assert.match(seasonText({ ...base, town_avg_mmk_kg: 1950 }, t, w) ?? '', /50 MMK per kg below the town price/);
  assert.equal(seasonText({ ...base, town_avg_mmk_kg: null }, t, w), 'This season you sold 2940 kg at 1,900 MMK per kg.');
  assert.equal(seasonText({ ...base, sold_kg: 0, avg_mmk_kg: null, deliveries: 0 }, t, w), null);
});
