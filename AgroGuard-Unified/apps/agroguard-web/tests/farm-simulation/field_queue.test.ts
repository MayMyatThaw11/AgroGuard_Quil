import assert from 'node:assert/strict';
import test from 'node:test';
import { enqueue, flushQueue, loadQueue, saveQueue, type QueuedItem } from '../../src/features/farm-simulation/lib/fieldQueue.ts';

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const reading = (id: string, observedAt: string, depth: number): QueuedItem => ({
  id,
  kind: 'reading',
  queuedAt: observedAt,
  body: { device_id: 'PD-02-tube', observed_at: observedAt, values: { water_depth_cm: depth }, reporter: 'Daw Hla' },
});

const decision = (id: string, proposal: string): QueuedItem => ({
  id,
  kind: 'decision',
  queuedAt: '2026-10-14T01:00:00Z',
  body: { proposal_id: proposal, decision: 'approved', decided_by: 'U Aung' },
});

test('queue survives a reload and replaces a duplicate reading', () => {
  const store = memory();
  let items = enqueue([], reading('a', '2026-10-14T01:00:00Z', -9));
  items = enqueue(items, reading('b', '2026-10-14T01:00:00Z', -9.5));
  items = enqueue(items, decision('c', 'prop_1'));
  saveQueue(items, store);
  const loaded = loadQueue(store);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].id, 'b');
});

test('corrupt storage reads as an empty queue', () => {
  const store = memory();
  store.setItem('agriquill.fieldQueue.v1', '{not json');
  assert.deepEqual(loadQueue(store), []);
  assert.deepEqual(loadQueue(null), []);
});

test('flush stops at the first network failure and keeps order', async () => {
  const items = [reading('a', '2026-10-14T01:00:00Z', -9), decision('b', 'prop_1'), reading('c', '2026-10-14T02:00:00Z', -10)];
  const seen: string[] = [];
  const { remaining, report } = await flushQueue(items, async (item) => {
    seen.push(item.id);
    return item.id === 'b' ? { result: 'retry', message: 'offline' } : { result: 'done' };
  });
  assert.deepEqual(seen, ['a', 'b']);
  assert.deepEqual(remaining.map((i) => i.id), ['b', 'c']);
  assert.equal(report.sent, 1);
  assert.equal(report.lastError, 'offline');
});

test('a stale approval is reported once and removed, not retried forever', async () => {
  const { remaining, report } = await flushQueue([decision('b', 'prop_1')], async () => ({
    result: 'conflict',
    message: 'proposal window has passed',
  }));
  assert.equal(remaining.length, 0);
  assert.equal(report.conflicts[0].message, 'proposal window has passed');
});
