import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { getAuthMe } from '../../src/features/farm-simulation/lib/api.ts';
import { ApiError } from '../../src/features/farm-simulation/lib/apiError.ts';

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
