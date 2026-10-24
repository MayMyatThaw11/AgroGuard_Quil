import assert from 'node:assert/strict';
import test from 'node:test';
import { FAO_HINTS, defaultDraft, planErrors, replayYears, toPlan } from '../../src/features/farm-simulation/lib/farmmap/seasonPlan.ts';

const TODAY = new Date('2026-10-24T00:00:00Z');
const parcel = { id: 'P1', area_ha: 1, planted: '2026-07-15' };

test('defaults come from the contract only and never fill the bund height', () => {
  const d = defaultDraft(parcel, TODAY);
  assert.equal(d.transplant_date, '2026-07-15');
  assert.equal(d.bund_height_cm, null);
  assert.equal(d.hills_per_m2, null);
  assert.deepEqual(d.weather_years, [2025]);
});

test('a bund lower than the reflood target is an error', () => {
  const d = { ...defaultDraft(parcel, TODAY), duration_days: 120, bund_height_cm: 5, reflood_cm: 8 };
  assert.ok(planErrors(d, TODAY).includes('farmMap.sim.err.bundBelowReflood'));
});

test('missing required fields are listed', () => {
  const errors = planErrors(defaultDraft(parcel, TODAY), TODAY);
  assert.ok(errors.includes('farmMap.sim.err.duration'));
  assert.ok(errors.includes('farmMap.sim.err.bund'));
});

test('an event outside the season is an error', () => {
  const d = {
    ...defaultDraft(parcel, TODAY),
    duration_days: 120,
    bund_height_cm: 30,
    events: [{ kind: 'irrigate' as const, date: '2027-03-01', mm: 50 }],
  };
  assert.deepEqual(planErrors(d, TODAY), ['farmMap.sim.err.eventOutside']);
});

test('replay years are the last five whose season has ended in the archive', () => {
  assert.deepEqual(replayYears(TODAY, '2026-07-15', 120), [2025, 2024, 2023, 2022, 2021]);
  assert.deepEqual(replayYears(new Date('2026-11-10T00:00:00Z'), '2026-07-01', 120), [2026, 2025, 2024, 2023, 2022]);
});

test('a valid draft becomes the API plan', () => {
  const d = { ...defaultDraft(parcel, TODAY), duration_days: 120, bund_height_cm: 30, hills_per_m2: 25, plants_per_hill: 3 };
  const plan = toPlan(d);
  assert.equal(plan.bund_height_cm, 30);
  assert.deepEqual(plan.water, { regime: 'continuous', awd_threshold_cm: null, reflood_cm: null, pid: null });
  assert.equal(FAO_HINTS.bundMinCm, 25);
  assert.equal(FAO_HINTS.bundRecommendedCm, 60);
});

import { PID_DEFAULTS } from '../../src/features/farm-simulation/lib/farmmap/seasonPlan.ts';

const pidDraft = () => ({ ...defaultDraft(parcel, TODAY), duration_days: 120, bund_height_cm: 20, regime: 'pid' as const });

test('the PID regime starts with tuned gains but no setpoint or pump rate', () => {
  const d = pidDraft();
  assert.equal(d.pid_kp, PID_DEFAULTS.kp);
  assert.equal(d.pid_setpoint_cm, null);
  assert.equal(d.pid_max_mm_day, null);
});

test('a PID plan without a setpoint or a pump rate is refused', () => {
  const errors = planErrors(pidDraft(), TODAY);
  assert.ok(errors.includes('farmMap.sim.err.pidSetpoint'));
  assert.ok(errors.includes('farmMap.sim.err.pidMax'));
});

test('the PID setpoint must sit below the bund', () => {
  const d = { ...pidDraft(), pid_setpoint_cm: 25, pid_max_mm_day: 40 };
  assert.deepEqual(planErrors(d, TODAY), ['farmMap.sim.err.pidAbove']);
});

test('a complete PID draft becomes the API plan with its settings', () => {
  const d = { ...pidDraft(), pid_setpoint_cm: 8, pid_max_mm_day: 40 };
  assert.deepEqual(planErrors(d, TODAY), []);
  const plan = toPlan(d);
  assert.deepEqual(plan.water.pid, { setpoint_cm: 8, kp: PID_DEFAULTS.kp, ki: PID_DEFAULTS.ki, kd: PID_DEFAULTS.kd, max_mm_day: 40 });
  assert.equal(plan.water.regime, 'pid');
});

test('other regimes send no PID settings', () => {
  const d = { ...defaultDraft(parcel, TODAY), duration_days: 120, bund_height_cm: 30 };
  assert.equal(toPlan(d).water.pid, null);
});
