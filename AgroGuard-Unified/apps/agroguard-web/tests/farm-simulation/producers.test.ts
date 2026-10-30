import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acresToHa,
  canFinish,
  haToAcres,
  loadActiveProducer,
  saveActiveProducer,
  SIZE_CHIPS,
  type ProducerDraft,
} from '../../src/features/farm-simulation/lib/farmmap/producers.ts';
import { enqueue, itemKey, loadQueue, saveQueue, type QueuedItem } from '../../src/features/farm-simulation/lib/fieldQueue.ts';

const draft = (patch: Partial<ProducerDraft> = {}): ProducerDraft => ({
  kind: 'household',
  name: 'Daw Hla',
  members: [],
  lat: 16.9,
  lon: 96.1,
  crops: [{ produce: 'tomato', harvest_month: 3 }],
  ...patch,
});

test('Producer: setup can finish only with kind, name, a point and a crop with its harvest month', () => {
  assert.equal(canFinish(draft()), true);
  assert.equal(canFinish(draft({ kind: null })), false);
  assert.equal(canFinish(draft({ name: '  ' })), false);
  assert.equal(canFinish(draft({ lat: null, lon: null })), false);
  assert.equal(canFinish(draft({ crops: [] })), false);
  assert.equal(canFinish(draft({ crops: [{ produce: 'tomato', harvest_month: 0 }] })), false);
});

test('Producer: acres convert to hectares and back', () => {
  assert.equal(acresToHa(1), 0.40468564);
  assert.ok(Math.abs(haToAcres(acresToHa(5)) - 5) < 1e-9);
});

test('Producer: every size chip stays under the 10 ha cap', () => {
  assert.ok(SIZE_CHIPS.every((chip) => acresToHa(chip.acres) <= 10));
});

test('Producer: the active profile is remembered per device and survives a broken store', () => {
  const memory = new Map<string, string>();
  const store = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
  assert.equal(loadActiveProducer(store), null);
  saveActiveProducer(store, 'pro-1');
  assert.equal(loadActiveProducer(store), 'pro-1');
  assert.equal(loadActiveProducer(null), null);
});

test('Producer: a queued registration round-trips through the field queue and dedupes by name and point', () => {
  const item: QueuedItem = { id: 'q1', kind: 'producer', queuedAt: '2026-10-30T00:00:00Z', body: draft() as never };
  const memory = new Map<string, string>();
  const store = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
  const queue = enqueue(enqueue([], item), { ...item, id: 'q2' });
  assert.equal(queue.length, 1);
  assert.equal(itemKey(item), 'producer:Daw Hla:16.9:96.1');
  saveQueue(queue, store);
  assert.deepEqual(loadQueue(store), queue);
});
