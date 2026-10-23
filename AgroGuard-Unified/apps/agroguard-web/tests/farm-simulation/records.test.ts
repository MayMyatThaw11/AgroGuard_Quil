import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import {
  addCertificate,
  addFumigation,
  addLot,
  addLotMill,
  addLotMoisture,
  correctRecord,
  downloadEvidencePack,
  getCertificates,
  getFumigations,
  getLots,
  getRoadmap,
  voidRecord,
  type FumigationVerdict,
} from '../../src/features/farm-simulation/lib/api.ts';
import { ApiError, BusyError } from '../../src/features/farm-simulation/lib/apiError.ts';
import type { ContractSpec } from '../../src/features/farm-simulation/lib/contractFarm.ts';
import { farmsRollup, verdictBadge, worstVerdict, type FarmRecords } from '../../src/features/farm-simulation/lib/farmmap/ownFarms.ts';

const realFetch = globalThis.fetch;
const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function capture(reply: unknown = {}, init: ResponseInit = {}, text?: string) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, req?: RequestInit) => {
    calls.push({
      url,
      method: req?.method ?? 'GET',
      headers: (req?.headers ?? {}) as Record<string, string>,
      body: typeof req?.body === 'string' ? JSON.parse(req.body) : undefined,
    });
    return new Response(text ?? JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
  }) as typeof fetch;
  return calls;
}

function signIn(code: string) {
  const data = new Map([['agriquill.accessCode', code]]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) },
  });
}

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

const FARMS = '/api/v1/agriquill/farms/demo%20farm';

test('record lists send limit, offset and include_voided only when asked', async () => {
  const calls = capture({ certificates: [], lots: [], total: 0 });
  await getCertificates('demo farm', { limit: 500, offset: 20, includeVoided: true });
  await getLots('demo farm');
  await getFumigations('demo farm', { includeVoided: false });
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [
    ['GET', `${FARMS}/certificates?limit=500&offset=20&include_voided=true`],
    ['GET', `${FARMS}/lots`],
    ['GET', `${FARMS}/fumigations`],
  ]);
});

test('creates POST the body with the write token header', async () => {
  signIn('FARMSIM-2026');
  const calls = capture({});
  await addCertificate('demo farm', { kind: 'organic', number: 'MM-1', issuer: 'MOAI', country: 'MM', issued: '2026-01-01', expires: '2026-12-01', added_by: 'Farm Manager' });
  await addFumigation('demo farm', { store: 'S1', parcels: ['P1'], product: 'Phostoxin', active_ingredient: 'aluminium phosphide', method: 'synthetic_chemical', applied_at: '2026-10-01', recorded_by: 'Farm Manager' });
  await addLot('demo farm', { id: 'L-1', parcels: ['P1'], harvested_on: '2026-10-20', mass_kg: 1200, certifier: null, recorded_by: 'Farm Manager' });
  await addLotMoisture('demo farm', 'L 1', { measured_at: '2026-10-21T08:00:00.000Z', moisture_pct: 15.5, storage: 'sack', recorded_by: 'Farm Manager' });
  await addLotMill('demo farm', 'L-1', { broken_pct: 12, buyer_max_broken_pct: 10, recorded_by: 'Farm Manager' });
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [
    ['POST', `${FARMS}/certificates`],
    ['POST', `${FARMS}/fumigations`],
    ['POST', `${FARMS}/lots`],
    ['POST', `${FARMS}/lots/L%201/moisture`],
    ['POST', `${FARMS}/lots/L-1/mill`],
  ]);
  for (const c of calls) assert.equal(c.headers['x-agriquill-write-token'], 'FARMSIM-2026');
  assert.equal((calls[0].body as { number: string }).number, 'MM-1');
  assert.deepEqual((calls[3].body as { moisture_pct: number; storage: string }), { measured_at: '2026-10-21T08:00:00.000Z', moisture_pct: 15.5, storage: 'sack', recorded_by: 'Farm Manager' });
});

test('a correction is a PATCH of the changes with a reason, and a void is a DELETE with the reason in the query', async () => {
  const calls = capture({});
  await correctRecord('demo farm', 'lots', 'L-1', { mass_kg: 1100 }, 'scale was off', 'Farm Manager');
  await voidRecord('demo farm', 'certificates', 'abc123', 'typed the wrong number', 'Farm Manager');
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].url, `${FARMS}/lots/L-1`);
  assert.deepEqual(calls[0].body, { changes: { mass_kg: 1100 }, reason: 'scale was off', corrected_by: 'Farm Manager' });
  assert.equal(calls[1].method, 'DELETE');
  assert.equal(calls[1].url, `${FARMS}/certificates/abc123?reason=typed+the+wrong+number&voided_by=Farm+Manager`);
  assert.equal(calls[1].body, undefined);
});

test('the evidence pack comes back as a file, with the season only when given', async () => {
  signIn('code-1');
  const calls = capture(undefined, { headers: { 'content-type': 'text/csv' } }, 'section,field,value\n');
  const blob = await downloadEvidencePack('demo farm', 'P1', '2026-06-01', null, 'csv');
  assert.equal(await blob.text(), 'section,field,value\n');
  assert.equal(calls[0].url, '/api/v1/agriquill/contracts/demo%20farm/evidence-pack?parcel=P1&format=csv&start=2026-06-01');
  assert.equal(calls[0].headers['x-agriquill-write-token'], 'code-1');
});

test('a failed evidence pack keeps the request id, and a busy one says so', async () => {
  capture({ detail: 'not found: P9' }, { status: 404, headers: { 'x-request-id': 'req-pack' } });
  await assert.rejects(downloadEvidencePack('f', 'P9', null, null, 'html'), (err: unknown) => err instanceof ApiError && err.requestId === 'req-pack' && err.message === 'not found: P9');
  capture({ detail: 'slow' }, { status: 429, headers: { 'retry-after': '3' } });
  await assert.rejects(getRoadmap(), (err: unknown) => err instanceof BusyError && err.retryAfterS === 3);
});

const spec: ContractSpec = { farm: { id: 'a', name: 'A', country: 'MM', location: null, standard: null }, parcels: [{ id: 'P1', area_ha: 1 }], assets: [] };
const farm = (id: string) => ({ id, seed: false, status: 'ok' as const, spec });

test('the roll-up counts due and expired certificates and lots still in store, leaving voided rows out', () => {
  const a: FarmRecords = {
    certificates: [{ alert: 'due' }, { alert: 'urgent' }, { alert: 'expired' }, { alert: null }, { alert: 'due', voided_at: '2026-10-01T00:00:00Z' }],
    lots: [{ mass_kg: 1000, mill: null }, { mass_kg: 500.5, mill: null }, { mass_kg: 800, mill: { broken_pct: 10, by: 'x' } }, { mass_kg: 99, mill: null, voided_at: '2026-10-01T00:00:00Z' }],
  };
  const b: FarmRecords = { certificates: [{ alert: 'due' }], lots: [] };
  const r = farmsRollup([farm('a'), farm('b'), farm('c')], new Map(), new Map([['a', a], ['b', b]]));
  assert.deepEqual(r.certificatesDue, { due: 3, expired: 1, farms: 2 });
  assert.deepEqual(r.lotsInStore, { lots: 2, kg: 1500.5, farms: 2 });
});

test('with no records loaded the roll-up says unknown, never zero', () => {
  const r = farmsRollup([farm('a')], new Map());
  assert.equal(r.certificatesDue, null);
  assert.equal(r.lotsInStore, null);
  const empty = farmsRollup([farm('a')], new Map(), new Map([['a', { certificates: [], lots: [] }]]));
  assert.deepEqual(empty.certificatesDue, { due: 0, expired: 0, farms: 1 });
});

const BLOCKED: FumigationVerdict = { result: 'blocked', standard: 'EU_ORGANIC', code: 'AGRI-E035', item: 'phosphine', clause: '2021/1165 Annex I' };
const CONDITIONAL: FumigationVerdict = { result: 'conditional', standard: 'NOP', clause: '205.271', condition: 'only after preventive practices fail' };

test('a blocked verdict names the item, clause and code, and outranks every other plot', () => {
  const b = verdictBadge(BLOCKED);
  assert.equal(b.tone, 'alert');
  assert.equal(b.word, 'Blocked');
  assert.match(b.detail, /phosphine.*EU_ORGANIC.*2021\/1165 Annex I.*AGRI-E035/);
  const worst = worstVerdict({ checks: { P1: { result: 'no_listed_item', standard: 'NOP' }, P2: CONDITIONAL, P3: BLOCKED } });
  assert.equal(worst?.result, 'blocked');
  assert.equal(worstVerdict({ checks: { P1: { result: 'no_standard', standard: null }, P2: CONDITIONAL } })?.result, 'conditional');
  assert.equal(worstVerdict({ checks: {} }), null);
});

test('conditional and unchecked verdicts say why, and a blocked one without a clause says so', () => {
  assert.equal(verdictBadge(CONDITIONAL).detail, 'only after preventive practices fail · 205.271');
  assert.equal(verdictBadge({ result: 'unchecked', standard: 'ASOA', reason: 'check with the certifier' }).word, 'Unchecked');
  assert.match(verdictBadge({ ...BLOCKED, clause: null }).detail, /clause not recorded/);
});
