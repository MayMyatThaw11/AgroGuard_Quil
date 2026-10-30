import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, type Key, type Vars } from '../../src/features/farm-simulation/lib/i18n.ts';
import { MILLER, showRows } from '../../src/features/farm-simulation/lib/farmmap/chunks.ts';
import { epistemicOf } from '../../src/features/farm-simulation/lib/farmmap/epistemic.ts';
import { buySteps, nextStep, sellSteps, stepsText } from '../../src/features/farm-simulation/lib/farmmap/steps.ts';
import { loadOutlook, saveOutlook, savedAgo } from '../../src/features/farm-simulation/lib/farmmap/outlookCache.ts';
import type { TodayItem } from '../../src/features/farm-simulation/lib/farmmap/today.ts';

const t = (key: Key, vars?: Vars) => translate('en', key, vars);

test('Miller: a list shows at most five rows until the person asks for more', () => {
  const rows = Array.from({ length: 12 }, (_, i) => i);
  assert.equal(MILLER, 5);
  assert.deepEqual(showRows(rows, false), { shown: [0, 1, 2, 3, 4], hidden: 7 });
  assert.deepEqual(showRows(rows, true), { shown: rows, hidden: 0 });
  assert.deepEqual(showRows([1, 2], false), { shown: [1, 2], hidden: 0 });
});

test('Zeigarnik: the first open step is next, finished steps stay done, the rest wait', () => {
  const steps = sellSteps({ profile: true, listed: true, offered: false, delivered: false, paid: false });
  assert.deepEqual(steps.map((s) => s.state), ['done', 'done', 'next', 'todo', 'todo']);
  assert.equal(nextStep(steps)?.id, 'offer');
  assert.equal(nextStep(sellSteps({ profile: true, listed: true, offered: true, delivered: true, paid: true })), undefined);
  assert.deepEqual(buySteps({ searched: true, asked: false, selected: false, received: false }).map((s) => s.state), ['done', 'next', 'todo', 'todo']);
});

test('steps text names the next step, or says all done', () => {
  assert.equal(stepsText(sellSteps({ profile: true, listed: false, offered: false, delivered: false, paid: false }), t), 'Next: List your harvest');
  assert.equal(stepsText(buySteps({ searched: true, asked: true, selected: true, received: true }), t), 'All steps done.');
});

test('Pragnanz and provenance: every item carries a measured, estimated or not-known tag', () => {
  const item = (source: TodayItem['source'], extra: Partial<TodayItem>): TodayItem => ({ key: 'k', source, level: 'info', topic: 'x', ...extra });
  assert.equal(epistemicOf(item('cue', { cue: { id: 'a', kind: 'new-buyers', params: {}, issued_on: '2026-11-01' } })), 'observed');
  assert.equal(epistemicOf(item('cue', { cue: { id: 'a', kind: 'harvest-soon', params: {}, issued_on: '2026-11-01' } })), 'inferred');
  assert.equal(epistemicOf(item('decision', { decision: { id: 'weak-crop', level: 'watch', params: {}, verify: true } })), 'inferred');
  assert.equal(epistemicOf(item('advice', { advice: { id: 'presell-bulk', params: {} } })), 'observed');
  assert.equal(epistemicOf(item('advice', { advice: { id: 'price-fell', params: {} } })), 'inferred');
  assert.equal(epistemicOf(item('advice', {})), 'unknown');
});

test('offline: the last outlook is kept per town and produce with its time', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  const outlook = { town: 'Hmawbi', produce: 'tomato', level: 'glut' } as never;
  assert.equal(loadOutlook(storage, 'Hmawbi', 'tomato'), null);
  saveOutlook(storage, 'Hmawbi', 'tomato', outlook, 1_700_000_000_000);
  const hit = loadOutlook(storage, 'Hmawbi', 'tomato');
  assert.equal(hit?.savedAt, 1_700_000_000_000);
  assert.equal(loadOutlook(storage, 'Taikkyi', 'tomato'), null);
  assert.equal(loadOutlook(null, 'Hmawbi', 'tomato'), null);
  assert.equal(savedAgo(1_700_000_000_000, 1_700_000_000_000 + 3 * 3600_000, 'en'), '3 h ago');
  assert.equal(savedAgo(1_700_000_000_000, 1_700_000_000_000 + 20 * 60_000, 'en'), '20 min ago');
});
