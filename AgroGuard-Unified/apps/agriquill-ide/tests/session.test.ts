import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { ApiError } from '../src/lib/apiError.ts';
import {
  STORAGE_BLOCKED,
  WRONG_CODE,
  WRONG_OWNER,
  activeSession,
  currentSession,
  sameName,
  signIn,
  signOut,
} from '../src/lib/session.ts';

const realFetch = globalThis.fetch;

function useStorage(blocked: boolean) {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (blocked) throw new Error('blocked');
        data.set(k, v);
      },
      removeItem: (k: string) => void data.delete(k),
    },
  });
}

function reply(status: number, body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;
}

beforeEach(() => useStorage(false));

afterEach(() => {
  globalThis.fetch = realFetch;
  signOut();
});

test('names match ignoring case and surrounding spaces', () => {
  assert.equal(sameName('  testuser ', 'TestUser'), true);
  assert.equal(sameName('Ko Ko', 'TestUser'), false);
  assert.equal(sameName('anyone', null), true);
});

test('sign in succeeds when the code belongs to the typed name', async () => {
  reply(200, { name: 'TestUser', roles: ['crew', 'manager'], sign_in_required: true });
  const session = await signIn(' testuser ', 'abc');
  assert.deepEqual(session, { name: 'TestUser', roles: ['crew', 'manager'] });
  assert.deepEqual(activeSession(), session);
});

test('sign in refuses a code that belongs to someone else', async () => {
  reply(200, { name: 'Ko Ko', roles: ['crew'], sign_in_required: true });
  await assert.rejects(signIn('TestUser', 'abc'), { message: WRONG_OWNER });
  assert.equal(activeSession(), null);
});

test('a wrong code says so in plain words; other server errors pass through', async () => {
  reply(401, { detail: 'this action needs the farm write token' });
  await assert.rejects(signIn('TestUser', 'nope'), { message: WRONG_CODE });
  assert.equal(activeSession(), null);
  reply(500, { detail: 'AGRIQUILL_USERS is malformed' });
  await assert.rejects(signIn('TestUser', 'abc'), { message: 'AGRIQUILL_USERS is malformed' });
});

test('open mode needs no sign in, a 401 does, an unreachable API is not a 401', async () => {
  reply(200, { name: null, roles: ['crew', 'manager'], sign_in_required: false });
  assert.deepEqual(await currentSession(), { open: true });
  reply(401, { detail: 'needs token' });
  assert.equal(await currentSession(), null);
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  await assert.rejects(currentSession(), TypeError);
});

test('a server error is not an unreachable API', async () => {
  reply(500, { detail: 'AGRIQUILL_USERS is malformed' });
  await assert.rejects(currentSession(), (err: unknown) => err instanceof ApiError && err.status === 500);
  reply(404, { detail: 'Not Found' });
  await assert.rejects(currentSession(), (err: unknown) => err instanceof ApiError && err.status === 404);
});

test('sign in fails when the browser will not keep the code', async () => {
  useStorage(true);
  reply(200, { name: 'TestUser', roles: ['crew'], sign_in_required: true });
  await assert.rejects(signIn('TestUser', 'abc'), { message: STORAGE_BLOCKED });
  assert.equal(activeSession(), null);
});
