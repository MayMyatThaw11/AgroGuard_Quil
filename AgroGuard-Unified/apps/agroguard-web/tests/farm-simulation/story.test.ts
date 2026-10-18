import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORY } from '../../src/features/farm-simulation/lib/story.ts';

test('Every number on a pitch step carries a source', () => {
  for (const step of STORY) {
    const text = `${step.headline} ${step.line}`;
    if (/\d/.test(text)) assert.ok(step.sources.length > 0, `${step.id} states a number with no source`);
    for (const source of step.sources) if (source.url) assert.match(source.url, /^https:\/\//, `${step.id}: ${source.label}`);
  }
});

test('The story opens on the globe, covers see, check, approve and prove, and ends with the ask', () => {
  assert.equal(new Set(STORY.map((s) => s.id)).size, STORY.length);
  assert.equal(STORY[0].view, 'map');
  assert.ok((STORY[0].camera?.zoom ?? 99) < 4, 'opens on the globe');
  assert.deepEqual(['see', 'check', 'approve', 'prove'].map((id) => STORY.some((s) => s.id === id)), [true, true, true, true]);
  assert.equal(STORY.at(-1)?.id, 'ask');
  assert.ok(STORY.length <= 7, 'seven beats fit the 3-minute video');
});

test('The AI is shown before the approval step, since judges score it first', () => {
  const ids = STORY.map((s) => s.id);
  assert.ok(ids.includes('ai') && ids.indexOf('ai') < ids.indexOf('approve'));
  assert.ok(!STORY.some((s) => /11 ASEAN|extra income/.test(`${s.headline} ${s.line}`)), 'no unsourced reach or income claims');
});
