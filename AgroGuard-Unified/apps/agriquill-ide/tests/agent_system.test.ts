import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  APPROVED_NEEDS_PIN,
  INITIAL_AI_AGENTS,
  SIGN_IN_TO_APPROVE,
  checkLines,
  decide,
  locationLines,
  planLines,
} from '../src/lib/agents/agentSystem.ts';
import { ApiError } from '../src/lib/apiError.ts';
import type { CrewTask, FarmCheck, LivePlan, Proposal } from '../src/data/ops/types.ts';

const sprayTask: CrewTask = {
  id: 't1',
  agent: 'drone_pilot',
  title: 'Spray blast fungicide',
  detail: '',
  day_offset: 0,
  date: '2026-10-15',
  priority: 'high',
  paddy_id: 'p1',
  asset_id: null,
  actuation: { target: 'drone', command: 'spray' },
  requires_human_approval: true,
  blocked_reason: 'wind 4.2 m/s is above the spray cap',
  evidence: [],
};

const proposal: Proposal = {
  proposal_id: 'prop_1',
  farm_id: 'farm_x',
  status: 'proposed',
  created_at: '',
  expires_at: '',
  text: 'Re-flood paddy p1',
  task: { title: 'Re-flood', actuation: { target: 'irrigation_valve', command: 'open' } },
  agri_patch: null,
};

test('agents: the roster carries no invented telemetry or thoughts', () => {
  assert.equal(INITIAL_AI_AGENTS.length, 5);
  for (const agent of INITIAL_AI_AGENTS) {
    assert.deepEqual(agent.telemetrySummary, {});
    assert.deepEqual(agent.recentThoughts, []);
  }
});

test('agents: the plan shows the server gate verdict for a spray job', () => {
  const plan: LivePlan = { farm_id: 'farm_x', status: 'OK', tasks: [sprayTask], missing: [] };
  const line = planLines(plan).find((item) => item.label === sprayTask.title);
  assert.ok(line);
  assert.match(line.value, /^blocked: wind 4\.2 m\/s/);
});

test('agents: missing weather is unknown with the reason', () => {
  const plan: LivePlan = {
    farm_id: 'farm_x',
    status: 'NO_WEATHER',
    tasks: [],
    missing: [{ field: 'weather', reason: 'forecast provider unreachable' }],
  };
  const weather = planLines(plan).find((item) => item.label === 'Weather');
  assert.equal(weather?.value, 'unknown: forecast provider unreachable');
});

test('agents: a short water record is a first look and an unknown standard is not checked', () => {
  const check: FarmCheck = {
    farm_id: 'farm_x',
    backtest: { status: 'OK', overall: { pairs: 4, model_mae_cm: 1.2, no_change_mae_cm: 2.0 }, missing: [] },
    spray_recent: { status: 'NO_DATA', missing: [{ field: 'wind', reason: 'no hourly wind' }] },
    inputs: { status: 'OK', standard: 'GLOBALG.A.P.', applications: [], missing: [] },
  };
  const lines = checkLines(check);
  assert.match(lines[0].value, /a first look, not a verdict/);
  assert.equal(lines[1].value, 'unknown: no hourly wind');
  assert.match(lines[2].value, /not checked by AgriQill \(TO VERIFY\)/);
});

test('agents: a contract without a location is unknown', () => {
  assert.equal(locationLines(null, null, null)[0].value, 'unknown: the contract has no location');
});

test('agents: approval without a signed-in name never calls the server', async () => {
  let called = false;
  const send = async () => {
    called = true;
    return proposal;
  };
  assert.equal(await decide(proposal, 'approved', send, undefined), SIGN_IN_TO_APPROVE);
  assert.equal(called, false);
});

test('agents: a 401 or 403 asks the person to sign in', async () => {
  for (const status of [401, 403]) {
    const send = async (): Promise<Proposal> => {
      throw new ApiError('denied', status);
    };
    assert.equal(await decide(proposal, 'approved', send, 'Aye Aye'), SIGN_IN_TO_APPROVE);
  }
});

test('agents: approving a valve proposal still points to the PIN step', async () => {
  const calls: string[] = [];
  const send = async (id: string, decision: 'approved' | 'rejected', who: string) => {
    calls.push(`${id}|${decision}|${who}`);
    return { ...proposal, status: decision };
  };
  assert.equal(await decide(proposal, 'approved', send, 'Aye Aye'), APPROVED_NEEDS_PIN);
  assert.deepEqual(calls, ['prop_1|approved|Aye Aye']);
});
