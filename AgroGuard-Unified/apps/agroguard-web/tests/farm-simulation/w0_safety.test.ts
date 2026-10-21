// Wave 0 frontend fixes (BUILD_PLAN_FRONTEND.md section 5).
//
// F-W0-1 the app shows sign-in, never farm data, when the server needs sign-in.
// F-W0-2 the field-command modal never approves; approval is a separate typed step.
// F-W0-3 agent views never show or send a PIN or a confirmation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { afterEach, beforeEach } from 'node:test';
import { ApiError } from '../../src/features/farm-simulation/lib/apiError.ts';
import { approvalReady } from '../../src/features/farm-simulation/lib/fieldMissions.ts';
import { DEFAULT_VALUES } from '../../src/features/farm-simulation/lib/paddySettings.ts';
import {
  OFFLINE_UNSIGNED,
  REPORTER_KEY,
  activeSession,
  signOut,
} from '../../src/features/farm-simulation/lib/session.ts';
import { checkSession } from '../../src/features/farm-simulation/lib/sessionGate.ts';
import { useFieldMissionStore } from '../../src/features/farm-simulation/store/fieldMissionStore.ts';

const FEATURE = new URL('../../src/features/farm-simulation/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, FEATURE), 'utf8');

const realFetch = globalThis.fetch;
const ACCESS_CODE_KEY = 'agriquill.accessCode';

function useStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  });
}

function reply(status: number, body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;
}

function unreachable() {
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
}

beforeEach(() => useStorage());

afterEach(() => {
  globalThis.fetch = realFetch;
  signOut();
});

// ── F-W0-1: sign-in gate ─────────────────────────────────────────────────────

test('server needs sign-in and nobody has: the gate is the sign-in screen', async () => {
  reply(401, { detail: 'this action needs the farm write token' });
  assert.equal(await checkSession(), null);
});

test('a signed-in name with a code the server no longer accepts goes back to sign-in', async () => {
  useStorage({ [REPORTER_KEY]: 'Ko Ko', [ACCESS_CODE_KEY]: 'old-code' });
  reply(401, { detail: 'this action needs the farm write token' });
  assert.equal(await checkSession(), null);
});

test('server needs sign-in but the code carries no name: sign in, not the app', async () => {
  reply(200, { name: null, roles: ['crew', 'manager'], sign_in_required: true });
  assert.equal(await checkSession(), null);
});

test('only a server that says no sign-in is needed opens the app without one', async () => {
  reply(200, { name: null, roles: ['crew', 'manager'], sign_in_required: false });
  assert.deepEqual(await checkSession(), { open: true });
});

test('an unreachable server with nobody signed in is an error, never the open app', async () => {
  unreachable();
  assert.deepEqual(await checkSession(), { error: OFFLINE_UNSIGNED });
  assert.equal(activeSession(), null);
});

test('an unreachable server with a stored sign-in keeps field work going as that person', async () => {
  useStorage({ [REPORTER_KEY]: 'Ko Ko', [ACCESS_CODE_KEY]: 'a-code' });
  unreachable();
  const gate = await checkSession();
  assert.deepEqual(gate, { name: 'Ko Ko', roles: [] });
  assert.deepEqual(activeSession(), { name: 'Ko Ko', roles: [] });
});

test('a stored name without a stored code is not a sign-in', async () => {
  useStorage({ [REPORTER_KEY]: 'Ko Ko' });
  unreachable();
  assert.deepEqual(await checkSession(), { error: OFFLINE_UNSIGNED });
});

test('a server error is shown as an error, whatever is stored on the device', async () => {
  useStorage({ [REPORTER_KEY]: 'Ko Ko', [ACCESS_CODE_KEY]: 'a-code' });
  reply(503, { detail: 'server sign-in is not configured' });
  assert.deepEqual(await checkSession(), { error: 'server sign-in is not configured' });
  assert.ok(ApiError);
});

// ── F-W0-2: the command modal never approves ─────────────────────────────────

const ctx = {
  paddy: { id: 'PD-02', crop: 'Lowland rice', stage: 'Tillering', day: 38, waterNowCm: -9, lowestAheadCm: -11.4, ndvi: 0.68, areaHa: 0.76 },
  windMs: 2.4,
  rain72hMm: 4,
  rain7dMm: 12,
  thresholds: DEFAULT_VALUES,
  standard: 'ASEAN_ORGANIC_ASOA',
};

function propose() {
  const store = useFieldMissionStore.getState();
  store.reset();
  return store.dispatchCommand({
    kind: 'command',
    machine: 'R-02',
    action: 'Weed between rows',
    text: 'Weed rows in PD-02',
    target: { x: -10, z: -20 },
    paddyId: 'PD-02',
    windMs: ctx.windMs,
    standard: ctx.standard,
  });
}

const phaseOf = (id: string) => useFieldMissionStore.getState().missions.find((m) => m.id === id)?.phase;

test('proposing a command leaves it proposed: nothing approves it', () => {
  const mission = propose();
  assert.equal(mission.phase, 'proposed');
  useFieldMissionStore.getState().tick(Date.now() + 60_000);
  assert.equal(phaseOf(mission.id), 'proposed');
});

test('approval needs the confirmation ticked AND a typed PIN', () => {
  const mission = propose();
  const store = useFieldMissionStore.getState();
  assert.notEqual(store.approve(mission.id, '4821', false), null, 'PIN without confirmation');
  assert.notEqual(store.approve(mission.id, '', true), null, 'confirmation without PIN');
  assert.notEqual(store.approve(mission.id, '12', true), null, 'PIN too short');
  assert.equal(phaseOf(mission.id), 'proposed');
  assert.equal(store.approve(mission.id, '4821', true), null);
  assert.equal(phaseOf(mission.id), 'queued');
});

test('the approve button stays off until confirmed with a PIN', () => {
  assert.equal(approvalReady(false, ''), false);
  assert.equal(approvalReady(true, ''), false);
  assert.equal(approvalReady(true, '  '), false);
  assert.equal(approvalReady(false, '4821'), false);
  assert.equal(approvalReady(true, '4821'), true);
});

test('the command modal has no PIN, no pre-ticked confirmation and no approve call', () => {
  const modal = read('components/ops/FieldComposerModal.tsx');
  assert.doesNotMatch(modal, /1234/, 'no default PIN');
  assert.doesNotMatch(modal, /\.approve\(/, 'the composer must never approve');
  assert.doesNotMatch(modal, /useState\(true\)/, 'nothing pre-ticked');
  assert.doesNotMatch(modal, /type="password"/, 'no PIN field in the composer');
  assert.match(modal, /simulated/i, 'labelled as simulated dispatch');
});

test('the approval step starts empty and unticked, takes a typed PIN, and says it is simulated', () => {
  const step = read('components/ops/MissionApproval.tsx');
  assert.match(step, /useState\(false\)/, 'confirmation starts unticked');
  assert.match(step, /useState\(''\)/, 'PIN starts empty');
  assert.match(step, /type="password"/);
  assert.match(step, /approvalReady\(/);
  assert.match(step, /Simulated dispatch/);
  assert.doesNotMatch(step, /1234/);
});

test('only the approval step calls the store approve, and the thread shows it for proposed commands', () => {
  const thread = read('components/ops/FieldThreadModal.tsx');
  assert.match(thread, /mission\.phase === 'proposed'[^\n]*<MissionApproval/);
  const callers = ['components/ops/FieldComposerModal.tsx', 'components/ops/FieldThreadModal.tsx', 'components/ops/MissionApproval.tsx']
    .filter((file) => /\bapprove\(/.test(read(file)));
  assert.deepEqual(callers, ['components/ops/MissionApproval.tsx']);
});

// ── F-W0-3: agent views never show or send a PIN or confirmation ─────────────

const SECRET_WORDS = /approval_pin|operator_confirmed|challenge_token|approvalPin|operatorConfirmed|type="password"|\bPIN\b/i;

test('agent and proposal views carry no PIN, confirmation or token', () => {
  for (const file of ['components/twin/TwinAgentsView.tsx', 'components/field/ProposalList.tsx']) {
    assert.doesNotMatch(read(file), SECRET_WORDS, `${file} must not handle approval secrets`);
  }
});

test('deciding a proposal sends a name and a decision, never a PIN', () => {
  const api = read('lib/api.ts');
  const start = api.indexOf('/decision');
  assert.ok(start > 0, 'decision call found');
  const call = api.slice(Math.max(0, start - 400), start + 400);
  assert.doesNotMatch(call, /approval_pin|operator_confirmed|challenge_token/);
});
