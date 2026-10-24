import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_VIEW, readView, writeView } from '../../src/features/farm-simulation/lib/viewMemory.ts';

function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

test('a reload returns to the view the user was on', () => {
  const storage = store();
  writeView(storage, { view: 'farm-map', destination: 'operations' });
  assert.deepEqual(readView(storage), { view: 'farm-map', destination: 'operations' });
});

test('an empty store opens the default view', () => {
  assert.deepEqual(readView(store()), DEFAULT_VIEW);
});

test('a missing store opens the default view and writing to it does not throw', () => {
  assert.deepEqual(readView(null), DEFAULT_VIEW);
  assert.doesNotThrow(() => writeView(null, DEFAULT_VIEW));
});

test('an unknown view or destination is ignored', () => {
  assert.deepEqual(readView(store({ 'agriquill.view': JSON.stringify({ view: 'gone', destination: 'operations' }) })), DEFAULT_VIEW);
  assert.deepEqual(readView(store({ 'agriquill.view': JSON.stringify({ view: 'fleet', destination: 'gone' }) })), DEFAULT_VIEW);
  assert.deepEqual(readView(store({ 'agriquill.view': '{not json' })), DEFAULT_VIEW);
});

test('a store that throws is treated as empty', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.deepEqual(readView(broken), DEFAULT_VIEW);
  assert.doesNotThrow(() => writeView(broken, DEFAULT_VIEW));
});
