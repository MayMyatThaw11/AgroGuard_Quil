import assert from 'node:assert/strict';
import test from 'node:test';
import type { SeasonReplay } from '../../src/features/farm-simulation/lib/api.ts';
import { keyStep, seasonViewFor, step, tintExpression, tintLevel, varAt } from '../../src/features/farm-simulation/lib/farmmap/seasonPlayback.ts';

test('speed 4 over 500 ms advances 2 days', () => {
  const next = step({ day: 0, playing: true, speed: 4, carry: 0 }, 500, 100);
  assert.equal(next.day, 2);
});

test('playback stops at the last day', () => {
  const next = step({ day: 98, playing: true, speed: 16, carry: 0 }, 1000, 100);
  assert.deepEqual([next.day, next.playing], [100, false]);
});

test('a paused playback does not move', () => {
  assert.equal(step({ day: 5, playing: false, speed: 16, carry: 0 }, 1000, 100).day, 5);
});

test('keyboard step clamps to the season', () => {
  assert.equal(keyStep(100, 'ArrowRight', 100), 100);
  assert.equal(keyStep(0, 'ArrowLeft', 100), 0);
  assert.equal(keyStep(10, 'ArrowRight', 100), 11);
  assert.equal(keyStep(10, 'End', 100), 100);
});

const run = {
  years: [
    {
      engines: {
        own: { days: [{ date: '2025-07-01', das: 0, stage: 'vegetative', vars: { ponded_mm: { value: null, reason: 'weather missing' } } }] },
        aquacrop: { status: 'failed', reason: 'x' },
      },
    },
  ],
} as unknown as SeasonReplay;

test('an unknown value keeps its reason', () => {
  assert.deepEqual(varAt(run, 0, 'own', 0, 'ponded_mm'), { value: null, reason: 'weather missing' });
  assert.equal(varAt(run, 0, 'aquacrop', 0, 'ponded_mm').reason, 'x');
});

test('the tint reads the feature state and scales by variable', () => {
  assert.deepEqual(tintExpression('ponded_mm').slice(0, 2), ['case', ['==', ['feature-state', 'tint'], null]]);
  assert.equal(tintLevel('ponded_mm', 150, 300), 0.5);
  assert.equal(tintLevel('weed_loss_pct', 25, 300), 0.25);
  assert.equal(tintLevel('canopy_cover', null, 300), null);
});

test('the map view of a day scales the water slab by the bund height', () => {
  const replay = {
    years: [{ plan: { bund_height_cm: 20 }, engines: { own: { days: [{ date: 'd', das: 0, stage: null, vars: { ponded_mm: { value: 100, unit: 'mm' }, canopy_cover: { value: 0.5, unit: 'fraction' } } }] } } }],
  } as unknown as SeasonReplay;
  assert.deepEqual(seasonViewFor(replay, 0, 'own', 0, 'canopy_cover', 'f|P1'), { key: 'f|P1', tint: 'canopy_cover', level: 0.5, slab: 0.5 });
  assert.equal(seasonViewFor(replay, 0, 'own', 5, 'canopy_cover', 'f|P1').slab, null);
});
