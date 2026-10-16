import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import type { QueuedItem } from '../src/lib/fieldQueue.ts';
import { sendItem } from '../src/lib/useFieldQueue.ts';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const decision: QueuedItem = {
  id: 'q1',
  kind: 'decision',
  queuedAt: '2026-10-14T01:00:00Z',
  body: { proposal_id: 'prop_1', decision: 'approved', decided_by: 'U Aung' },
};

function answer(status: number, body: unknown): void {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('a missing or wrong farm access code keeps the item queued and says why', async () => {
  answer(401, { detail: 'write token missing or wrong' });
  const out = await sendItem(decision);
  assert.equal(out.result, 'retry');
  assert.match(out.message ?? '', /access code/);
});

test('a stale approval is a conflict, not a retry', async () => {
  answer(409, { detail: 'proposal window has passed' });
  assert.deepEqual(await sendItem(decision), { result: 'conflict', message: 'proposal window has passed' });
});

test('a network failure keeps the item queued', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  const out = await sendItem(decision);
  assert.equal(out.result, 'retry');
  assert.equal(out.message, 'Failed to fetch');
});
