import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { getAuthMe, getSummary, onboardFarm } from '../../src/features/farm-simulation/lib/api.ts';
import { ApiError, BusyError, busyText, failedText } from '../../src/features/farm-simulation/lib/apiError.ts';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })) as typeof fetch;
}

test('an error response gives ApiError its stable code and request id', async () => {
  reply(
    403,
    { code: 'FORBIDDEN', message: 'no access', status: 403, request_id: 'req-123456', detail: 'no access' },
    { 'x-request-id': 'req-123456' }
  );
  await assert.rejects(getAuthMe('x'), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, 'FORBIDDEN');
    assert.equal(err.requestId, 'req-123456');
    assert.equal(err.message, 'no access');
    return true;
  });
});

test('an older server without a code still gives a readable error', async () => {
  reply(500, { detail: 'boom' });
  await assert.rejects(getAuthMe('x'), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, null);
    assert.equal(err.message, 'boom');
    return true;
  });
});

function count(status: number, headers: Record<string, string> = {}, body: unknown = { detail: 'overloaded' }) {
  const calls: string[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    calls.push(init?.method ?? 'GET');
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  }) as typeof fetch;
  return calls;
}

test('a 503 with Retry-After in seconds says how long to wait and keeps the request id', async () => {
  count(503, { 'retry-after': '7', 'x-request-id': 'req-busy' });
  await assert.rejects(getAuthMe('x'), (err: unknown) => {
    assert.ok(err instanceof BusyError);
    assert.equal(err.message, 'Busy, try again in 7 s');
    assert.equal(err.retryAfterS, 7);
    assert.equal(err.requestId, 'req-busy');
    return true;
  });
});

test('a 429 with Retry-After as an HTTP date counts the seconds to that date', async () => {
  count(429, { 'retry-after': new Date(Date.now() + 30_000).toUTCString() });
  await assert.rejects(getAuthMe('x'), (err: unknown) => {
    assert.ok(err instanceof BusyError);
    assert.match(err.message, /^Busy, try again in (29|30) s$/);
    return true;
  });
});

test('a busy reply without Retry-After gives no wait time', async () => {
  count(503, {}, {});
  await assert.rejects(getAuthMe('x'), (err: unknown) => err instanceof BusyError && err.message === 'Busy, try again');
});

test('a 503 that names its cause without Retry-After keeps the server text', async () => {
  count(503, { 'x-request-id': 'req-cfg' }, { detail: 'server sign-in is not configured' });
  await assert.rejects(getAuthMe('x'), (err: unknown) => {
    assert.ok(err instanceof ApiError && !(err instanceof BusyError));
    assert.equal(err.message, 'server sign-in is not configured');
    assert.equal(err.requestId, 'req-cfg');
    return true;
  });
});

test('busyText ignores a past or unreadable wait', () => {
  assert.equal(busyText(null), 'Busy, try again');
  assert.equal(busyText(-3), 'Busy, try again');
  assert.equal(busyText(0.2), 'Busy, try again in 1 s');
});

test('a busy write is sent once and never retried', async () => {
  const calls = count(503, { 'retry-after': '1' });
  await assert.rejects(onboardFarm('f1', { name: 'F', country: 'MM', registered_by: 'me' }), BusyError);
  assert.deepEqual(calls, ['POST']);
});

test('a busy read is not retried either', async () => {
  const calls = count(429);
  await assert.rejects(getSummary('f1'), BusyError);
  assert.equal(calls.length, 1);
});

test('failedText names the request id, or the wait when busy', () => {
  assert.equal(failedText(new ApiError('boom', 500, null, 'req-9'), 'Trust score unavailable'), 'Trust score unavailable · request req-9');
  assert.equal(failedText(new BusyError(503, 4), 'Trust score unavailable'), 'Trust score unavailable · Busy, try again in 4 s');
  assert.equal(failedText(new Error('offline'), 'Trust score unavailable'), 'Trust score unavailable');
});
