import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOpsFarm } from '../src/data/fleet/farmToOps.ts';
import { OPS_FARM } from '../src/data/ops/fixture.ts';
import { ApiError, SIGN_IN_TO_WRITE, isSignInNeeded, writeErrorText } from '../src/lib/apiError.ts';
import { chooseOpsFarm, farmLoadProblem, type OpsFarmChoice } from '../src/lib/contractFarm.ts';
import { STORY_FARM } from '../src/lib/story.ts';

const message = (choice: OpsFarmChoice) => (choice.farm === null ? choice.message : 'opened a farm');
const customer = { ...OPS_FARM, id: 'farm_customer_01', name: 'Customer farm' };

test('Ops fallback: an unknown farm id never resolves to the demo farm', () => {
  assert.equal(resolveOpsFarm('farm_customer_01'), null);
  assert.equal(resolveOpsFarm('cust_farm_7'), null);
  assert.equal(resolveOpsFarm('FM-007')?.id, 'FM-007');
  assert.equal(resolveOpsFarm(STORY_FARM), OPS_FARM);
  assert.equal(resolveOpsFarm(undefined), OPS_FARM);
});

test('Ops fallback: a customer farm shows its contract, a load state or a named problem', () => {
  const id = 'farm_customer_01';
  assert.deepEqual(chooseOpsFarm(id, true, null, { state: 'ready', farm: customer }), { farm: customer, fixture: false, hasFixture: false });
  assert.deepEqual(chooseOpsFarm(id, true, null, { state: 'loading' }), { farm: null, loading: true, message: `Loading ${id}` });

  const failed = (status: number) => chooseOpsFarm(id, true, null, { state: 'failed', error: new ApiError('x', status) });
  assert.equal(message(failed(401)), 'Sign in to open farm_customer_01');
  assert.equal(message(failed(403)), 'Your access code does not cover farm_customer_01');
  assert.equal(message(failed(404)), 'farm_customer_01 is not registered on this server');
  assert.match(farmLoadProblem(id, new TypeError('Failed to fetch')), /farm_customer_01 could not be loaded: the farm service is offline/);

  assert.match(message(chooseOpsFarm(id, true, null, { state: 'ready', farm: null })), /no readable farm location/);
  assert.match(message(chooseOpsFarm(id, false, null, { state: 'loading' })), /not a demo farm/);
});

test('Ops fallback: only the demo id falls back to the labelled demo fixture', () => {
  const failed = { state: 'failed', error: new ApiError('down', 503) } as const;
  assert.deepEqual(chooseOpsFarm(STORY_FARM, true, OPS_FARM, failed), { farm: OPS_FARM, fixture: true, hasFixture: true });
  assert.deepEqual(chooseOpsFarm(STORY_FARM, false, OPS_FARM, { state: 'loading' }), { farm: OPS_FARM, fixture: true, hasFixture: true });
  const contract = { ...OPS_FARM, name: 'From contract' };
  assert.deepEqual(chooseOpsFarm(STORY_FARM, true, OPS_FARM, { state: 'ready', farm: contract }), {
    farm: contract,
    fixture: false,
    hasFixture: true,
  });
});

test('Ops fallback: 401 and 403 become the plain sign-in message', () => {
  assert.equal(isSignInNeeded(new ApiError('this action needs the farm write token', 401)), true);
  assert.equal(isSignInNeeded(new ApiError('no access', 403)), true);
  assert.equal(isSignInNeeded(new ApiError('bad body', 422)), false);
  assert.equal(isSignInNeeded(new Error('offline')), false);
  assert.equal(writeErrorText(new ApiError('this action needs the farm write token', 401), 'x'), SIGN_IN_TO_WRITE);
  assert.equal(writeErrorText(new ApiError('dan does not have the manager role', 403), 'x'), `${SIGN_IN_TO_WRITE} · dan does not have the manager role`);
  assert.equal(writeErrorText(new ApiError('bad body', 422), 'x'), 'bad body');
  assert.equal(writeErrorText('nope', 'fallback'), 'fallback');
});
