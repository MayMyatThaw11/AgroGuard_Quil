import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motionAllowed, rankToday, type AdviceItem } from '../../src/features/farm-simulation/lib/farmmap/today.ts';
import type { Decision } from '../../src/features/farm-simulation/lib/farmmap/farmDecisions.ts';
import type { Cue } from '../../src/features/farm-simulation/lib/farmmap/marketCues.ts';

const decision = (id: Decision['id'], level: Decision['level']): Decision => ({ id, level, params: {}, verify: false });
const cue = (kind: Cue['kind'], issued_on: string): Cue => ({ id: `${kind}-${issued_on}`, kind, params: {}, issued_on });
const advice = (id: AdviceItem['id']): AdviceItem => ({ id, params: {} });

test('ranks act before watch before info and caps the list at three', () => {
  const items = rankToday(
    [decision('stage', 'info'), decision('rain-hold', 'watch'), decision('dry-soil', 'act'), decision('weak-crop', 'watch')],
    [advice('presell-bulk')],
    [cue('new-buyers', '2026-11-01')],
  );
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.level), ['act', 'watch', 'watch']);
  assert.equal(items[0].topic, 'soil');
});

test('drops ok decisions and ties break by the newest cue first', () => {
  const items = rankToday([decision('water-keep', 'ok'), decision('rain-clear', 'ok')], [], [cue('harvest-soon', '2026-11-01'), cue('new-buyers', '2026-11-03')]);
  assert.deepEqual(items.map((i) => i.source), ['cue', 'cue']);
  assert.equal(items[0].cue?.kind, 'new-buyers');
});

test('a rain-hold decision and a pickup rain warning collapse into one item', () => {
  const items = rankToday([decision('rain-hold', 'watch')], [advice('pickup-rain')], []);
  assert.equal(items.length, 1);
  assert.equal(items[0].source, 'decision');
  assert.equal(items[0].topic, 'rain');
});

test('nothing to say gives an empty list', () => {
  assert.deepEqual(rankToday([], [], []), []);
});

test('motion is off for reduced motion, save-data and four or fewer cores', () => {
  assert.equal(motionAllowed({ reducedMotion: false, saveData: false, cores: 8 }), true);
  assert.equal(motionAllowed({ reducedMotion: true, saveData: false, cores: 8 }), false);
  assert.equal(motionAllowed({ reducedMotion: false, saveData: true, cores: 8 }), false);
  assert.equal(motionAllowed({ reducedMotion: false, saveData: false, cores: 4 }), false);
  assert.equal(motionAllowed({ reducedMotion: false, saveData: false, cores: null }), true);
});
