import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { OpsPlan } from '../src/data/ops/types.ts';
import { ApiError } from '../src/lib/apiError.ts';
import { DEFAULT_VALUES, STORAGE_KEY, type StorageLike, type ThresholdKey } from '../src/lib/paddySettings.ts';
import { dirtyKeys, usePaddySettingsStore } from '../src/store/paddySettingsStore.ts';

function memoryStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

function fakePlan(taskCount: number): OpsPlan {
  return { tasks: Array.from({ length: taskCount }, () => ({})) } as unknown as OpsPlan;
}

const state = () => usePaddySettingsStore.getState();

beforeEach(() => {
  usePaddySettingsStore.setState(usePaddySettingsStore.getInitialState(), true);
});

test('Paddy settings store: starts clean on the planner defaults', () => {
  assert.deepEqual({ ...state().applied }, { ...DEFAULT_VALUES });
  assert.deepEqual({ ...state().draft }, { ...DEFAULT_VALUES });
  assert.equal(state().applyStatus, 'idle');
  assert.deepEqual(dirtyKeys(state().applied, state().draft), []);
});

test('Paddy settings store: hydrate restores saved values into both applied and draft', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, values: { awd_safe_depth_cm: -12 } }));
  state().hydrate(storage);
  assert.equal(state().applied.awd_safe_depth_cm, -12);
  assert.equal(state().draft.awd_safe_depth_cm, -12);
  assert.equal(state().storageOk, true);
});

test('Paddy settings store: hydrate without storage still works and flags storage as unavailable', () => {
  state().hydrate(null);
  assert.equal(state().storageOk, false);
  assert.deepEqual({ ...state().draft }, { ...DEFAULT_VALUES });
});

test('Paddy settings store: editing a value marks only that key dirty', () => {
  state().setDraftValue('rain_hold_mm', 30);
  assert.deepEqual(dirtyKeys(state().applied, state().draft), ['rain_hold_mm']);
  assert.equal(state().applied.rain_hold_mm, DEFAULT_VALUES.rain_hold_mm);
});

test('Paddy settings store: invalid drafts produce blocking issues', () => {
  state().setDraftValue('spray_wind_advisory_ms', 6);
  assert.ok(state().issues.some((entry) => entry.key === 'spray_wind_advisory_ms' && entry.level === 'error'));
});

test('Paddy settings store: resetField and resetGroup change the draft only', () => {
  state().setDraftValue('rain_hold_mm', 30);
  state().setDraftValue('awd_safe_depth_cm', -10);
  state().setDraftValue('blast_rh_pct', 80);
  state().resetField('rain_hold_mm');
  assert.equal(state().draft.rain_hold_mm, DEFAULT_VALUES.rain_hold_mm);
  state().resetGroup('water');
  assert.equal(state().draft.awd_safe_depth_cm, DEFAULT_VALUES.awd_safe_depth_cm);
  assert.equal(state().draft.blast_rh_pct, 80);
});

test('Paddy settings store: reset all needs a confirmation and never touches applied values', () => {
  state().setDraftValue('rain_hold_mm', 30);
  state().requestResetAll();
  assert.equal(state().resetDialogOpen, true);
  state().cancelResetAll();
  assert.equal(state().resetDialogOpen, false);
  assert.equal(state().draft.rain_hold_mm, 30);
  state().requestResetAll();
  state().confirmResetAll();
  assert.equal(state().resetDialogOpen, false);
  assert.deepEqual({ ...state().draft }, { ...DEFAULT_VALUES });
});

test('Paddy settings store: discard returns the draft to the applied values', () => {
  state().setDraftValue('rain_hold_mm', 30);
  state().discard();
  assert.deepEqual(dirtyKeys(state().applied, state().draft), []);
});

test('Paddy settings store: apply sends only changed overrides, then commits, saves and hands over the plan', async () => {
  const storage = memoryStorage();
  const seen: Partial<Record<ThresholdKey, number>>[] = [];
  const plans: OpsPlan[] = [];
  state().setDraftValue('spray_wind_advisory_ms', 2.5);
  await state().apply({
    requestPlan: async (overrides) => {
      seen.push(overrides);
      return fakePlan(4);
    },
    storage,
    onPlan: (plan) => plans.push(plan),
  });
  assert.deepEqual(seen, [{ spray_wind_advisory_ms: 2.5 }]);
  assert.equal(state().applied.spray_wind_advisory_ms, 2.5);
  assert.equal(state().applyStatus, 'applied');
  assert.equal(state().lastTaskCount, 4);
  assert.equal(plans.length, 1);
  assert.equal(JSON.parse(storage.data[STORAGE_KEY]).values.spray_wind_advisory_ms, 2.5);
});

test('Paddy settings store: a server rejection keeps the applied values and shows the server message', async () => {
  const storage = memoryStorage();
  state().setDraftValue('spray_wind_advisory_ms', 2.5);
  await state().apply({
    requestPlan: async () => {
      throw new ApiError('spray_wind_advisory_ms must be within (0, 5.5] m/s hard ceiling', 422);
    },
    storage,
    onPlan: () => undefined,
  });
  assert.equal(state().applyStatus, 'rejected');
  assert.match(state().applyError ?? '', /hard ceiling/);
  assert.equal(state().applied.spray_wind_advisory_ms, DEFAULT_VALUES.spray_wind_advisory_ms);
  assert.equal(state().draft.spray_wind_advisory_ms, 2.5);
  assert.equal(storage.data[STORAGE_KEY], undefined);
});

test('Paddy settings store: an unreachable planner saves locally and flags the values as unverified', async () => {
  const storage = memoryStorage();
  state().setDraftValue('rain_hold_mm', 30);
  await state().apply({
    requestPlan: async () => {
      throw new Error('Failed to fetch');
    },
    storage,
    onPlan: () => undefined,
  });
  assert.equal(state().applyStatus, 'offline');
  assert.equal(state().applied.rain_hold_mm, 30);
  assert.equal(JSON.parse(storage.data[STORAGE_KEY]).values.rain_hold_mm, 30);
});

test('Paddy settings store: apply refuses to run while the draft has blocking errors', async () => {
  let called = false;
  state().setDraftValue('spray_wind_advisory_ms', 6);
  await state().apply({
    requestPlan: async () => {
      called = true;
      return fakePlan(0);
    },
    storage: memoryStorage(),
    onPlan: () => undefined,
  });
  assert.equal(called, false);
  assert.equal(state().applyStatus, 'idle');
});
