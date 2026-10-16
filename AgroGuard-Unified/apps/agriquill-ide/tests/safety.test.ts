/**
 * Specification for the client mirror of backend/agriquill/safety.py.
 *
 * Run: node --test tests/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NOT_CHECKED,
  PROHIBITED_INPUTS,
  STANDARD_ALIASES,
  VALVE_MAX_CONTINUOUS_MINUTES,
  WIND_CEILING_MS,
  checkHumanApproval,
  checkProhibitedInputs,
  checkValveDuration,
  checkWindCeiling,
  evaluateActuation,
  prohibitedFor,
  standardLabel,
  type ActuationPermit,
  type GuardRejection,
  type GuardVerdict
} from '../src/lib/safety.ts';

/**
 * Narrowing helpers. `GuardVerdict` is a discriminated union on `permitted`, so
 * reading `.rejection` requires proving the negative branch first. These assert
 * that proof rather than casting it away.
 */
function rejectionOf(verdict: GuardVerdict): GuardRejection {
  assert.equal(verdict.permitted, false, 'expected a rejecting verdict');
  if (verdict.permitted) throw new Error('unreachable: verdict was permitted');
  return verdict.rejection;
}

function failureOf(permit: ActuationPermit): GuardRejection {
  assert.ok(permit.failure, 'expected a failure detail on a non-PERMITTED permit');
  if (!permit.failure) throw new Error('unreachable: failure was null');
  return permit.failure;
}

test('wind ceiling: 5.5 m/s is permitted at the boundary', () => {
  assert.equal(checkWindCeiling(WIND_CEILING_MS).permitted, true);
});

test('wind ceiling: 5.6 m/s halts with REJECTED_WIND_EXCEEDED', () => {
  const rejection = rejectionOf(checkWindCeiling(5.6));
  assert.equal(rejection.code, 'REJECTED_WIND_EXCEEDED');
  assert.match(rejection.detail, /5\.60 m\/s exceeds ceiling 5\.5 m\/s/);
});

test('wind ceiling: absent telemetry rejects rather than assuming calm', () => {
  for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(rejectionOf(checkWindCeiling(value)).code, 'REJECTED_INVALID_TELEMETRY');
  }
});

test('wind ceiling: negative telemetry is invalid, not calm', () => {
  assert.equal(rejectionOf(checkWindCeiling(-1)).code, 'REJECTED_INVALID_TELEMETRY');
});

test('ASOA gate: synthetic_urea is prohibited and blocks', () => {
  const rejection = rejectionOf(checkProhibitedInputs(['synthetic_urea'], 'ASEAN_ORGANIC_ASOA'));
  assert.equal(rejection.code, 'REJECTED_PROHIBITED_INPUT');
});

test('ASOA gate: matching is case-insensitive and trimmed', () => {
  assert.equal(checkProhibitedInputs(['  Synthetic_Urea  '], 'ASEAN_ORGANIC_ASOA').permitted, false);
});

test('ASOA gate: permitted organic input passes', () => {
  assert.equal(
    checkProhibitedInputs(['AzollaBioCompost', 'vermicompost'], 'ASEAN_ORGANIC_ASOA').permitted,
    true
  );
});

test('ASOA gate: every registered standard has a non-empty prohibited list', () => {
  for (const [standard, list] of Object.entries(PROHIBITED_INPUTS)) {
    assert.ok(list.length > 0, `${standard} has no prohibited inputs`);
    assert.ok(list.includes('synthetic_urea'), `${standard} omits synthetic_urea`);
  }
});

test('compliance gate: an unknown standard refuses instead of permitting', () => {
  const rejection = rejectionOf(checkProhibitedInputs(['anything'], 'MADE_UP_STANDARD'));
  assert.equal(rejection.code, 'REJECTED_INVALID_TELEMETRY');
  assert.match(rejection.detail, /not checked by AgriQill \(TO VERIFY\)/);
});

test('compliance gate: the standards match the server list exactly', () => {
  assert.deepEqual(Object.keys(PROHIBITED_INPUTS).sort(), ['ASEAN_ORGANIC_ASOA', 'EU_2018_848', 'USDA_NOP']);
  assert.deepEqual(STANDARD_ALIASES, { ASOA_ORGANIC_V2: 'ASEAN_ORGANIC_ASOA', ASOA_ORGANIC: 'ASEAN_ORGANIC_ASOA' });
});

test('compliance gate: ASOA aliases block synthetic_urea like the canonical name', () => {
  for (const alias of Object.keys(STANDARD_ALIASES)) {
    assert.equal(rejectionOf(checkProhibitedInputs(['synthetic_urea'], alias)).code, 'REJECTED_PROHIBITED_INPUT');
  }
});

test('compliance gate: a farm with no standard runs no banned-input list', () => {
  assert.equal(checkProhibitedInputs(['synthetic_urea'], '').permitted, true);
  assert.equal(prohibitedFor(null), null);
});

test('standard label: names what AgriQill does not check', () => {
  assert.equal(standardLabel('ASOA_ORGANIC'), 'ASOA_ORGANIC');
  assert.equal(standardLabel('BioSuisse_Organic'), `BioSuisse_Organic: ${NOT_CHECKED}`);
  assert.match(standardLabel(null), /no standard declared/);
});

test('end-to-end: a farm with no standard still keeps the wind halt and the approval step', () => {
  const windy = evaluateActuation({ target: 'drone', windSpeedMs: 6.0, approvalPin: '9182', operatorConfirmed: true });
  assert.equal(failureOf(windy).code, 'REJECTED_WIND_EXCEEDED');
  const unapproved = evaluateActuation({ target: 'sluice_gate' });
  assert.equal(unapproved.status, 'PENDING_APPROVAL');
});

test('approval gate: no confirmation rejects as PENDING', () => {
  const rejection = rejectionOf(checkHumanApproval('1234', false));
  assert.equal(rejection.code, 'REJECTED_APPROVAL_MISSING');
});

test('approval gate: short PIN rejects', () => {
  assert.equal(checkHumanApproval('12', true).permitted, false);
});

test('approval gate: confirmation plus 4-char PIN permits', () => {
  assert.equal(checkHumanApproval('1234', true).permitted, true);
});

test('valve clamp: 180 min permitted, 181 rejected', () => {
  assert.equal(checkValveDuration(VALVE_MAX_CONTINUOUS_MINUTES).permitted, true);
  const over = checkValveDuration(VALVE_MAX_CONTINUOUS_MINUTES + 1);
  assert.equal(rejectionOf(over).code, 'REJECTED_DURATION_EXCEEDED');
});

test('valve clamp: non-positive duration is invalid', () => {
  for (const value of [0, -5, Number.NaN]) {
    assert.equal(rejectionOf(checkValveDuration(value)).code, 'REJECTED_INVALID_TELEMETRY');
  }
});

test('end-to-end: drone at 6.5 m/s is rejected even with a valid PIN', () => {
  const permit = evaluateActuation({
    target: 'drone',
    windSpeedMs: 6.5,
    declaredInputs: ['AzollaBioCompost'],
    parcelStandard: 'ASEAN_ORGANIC_ASOA',
    approvalPin: '9182',
    operatorConfirmed: true,
    requestedMinutes: 20
  });
  assert.equal(permit.status, 'REJECTED');
  assert.equal(failureOf(permit).code, 'REJECTED_WIND_EXCEEDED');
  assert.deepEqual(permit.gatesPassed, []);
});

test('end-to-end: drone at 5.5 m/s with valid approval is permitted', () => {
  const permit = evaluateActuation({
    target: 'drone',
    windSpeedMs: 5.5,
    declaredInputs: ['AzollaBioCompost'],
    parcelStandard: 'ASEAN_ORGANIC_ASOA',
    approvalPin: '9182',
    operatorConfirmed: true,
    requestedMinutes: 20
  });
  assert.equal(permit.status, 'PERMITTED');
  assert.equal(permit.gatesPassed.includes('gate1_wind'), true);
  assert.equal(permit.gatesPassed.includes('gate2_compliance'), true);
  assert.equal(permit.gatesPassed.includes('gate3_human_approval'), true);
});

test('end-to-end: prohibited input blocks a drone mission at safe wind', () => {
  const permit = evaluateActuation({
    target: 'drone',
    windSpeedMs: 2.0,
    declaredInputs: ['synthetic_urea'],
    parcelStandard: 'ASEAN_ORGANIC_ASOA',
    approvalPin: '9182',
    operatorConfirmed: true,
    requestedMinutes: 20
  });
  assert.equal(permit.status, 'REJECTED');
  assert.equal(failureOf(permit).code, 'REJECTED_PROHIBITED_INPUT');
  assert.deepEqual(permit.gatesPassed, ['gate1_wind']);
});

test('end-to-end: approval shortfall is PENDING, not a hard reject', () => {
  const permit = evaluateActuation({
    target: 'drone',
    windSpeedMs: 2.0,
    declaredInputs: ['AzollaBioCompost'],
    parcelStandard: 'ASEAN_ORGANIC_ASOA',
    approvalPin: null,
    operatorConfirmed: false,
    requestedMinutes: 20
  });
  assert.equal(permit.status, 'PENDING_APPROVAL');
  assert.equal(failureOf(permit).code, 'REJECTED_APPROVAL_MISSING');
});

test('end-to-end: irrigation valve over 180 min is clamped by rejection', () => {
  const permit = evaluateActuation({
    target: 'irrigation_valve',
    windSpeedMs: 1.0,
    declaredInputs: [],
    parcelStandard: 'ASEAN_ORGANIC_ASOA',
    approvalPin: '9182',
    operatorConfirmed: true,
    requestedMinutes: 200
  });
  assert.equal(permit.status, 'REJECTED');
  assert.equal(failureOf(permit).code, 'REJECTED_DURATION_EXCEEDED');
});

test('wind gate is evaluated before the compliance gate', () => {
  const permit = evaluateActuation({
    target: 'drone',
    windSpeedMs: 9.9,
    declaredInputs: ['synthetic_urea'],
    parcelStandard: 'ASEAN_ORGANIC_ASOA',
    approvalPin: '9182',
    operatorConfirmed: true,
    requestedMinutes: 20
  });
  // Both conditions fail; the wind halt must be the reported reason.
  assert.equal(failureOf(permit).code, 'REJECTED_WIND_EXCEEDED');
});

test('every rejection carries a human-readable detail', () => {
  const cases = [
    checkWindCeiling(7),
    checkProhibitedInputs(['glyphosate'], 'EU_2018_848'),
    checkHumanApproval(null, false),
    checkValveDuration(999),
    checkWindCeiling(Number.NaN)
  ];
  for (const verdict of cases) {
    assert.ok(rejectionOf(verdict).detail.length > 10);
  }
});