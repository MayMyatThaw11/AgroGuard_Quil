import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VALUES,
  SCHEMA_VERSION,
  STORAGE_KEY,
  THRESHOLDS,
  THRESHOLD_GROUPS,
  effectiveFromPlan,
  hasBlockingIssue,
  loadSettings,
  saveSettings,
  toOverrides,
  validate,
  type StorageLike,
  type ThresholdValues,
} from '../../src/features/farm-simulation/lib/paddySettings.ts';
import { WIND_CEILING_MS } from '../../src/features/farm-simulation/lib/safety.ts';

const BACKEND_DEFAULTS: Record<string, number> = {
  awd_safe_depth_cm: -15,
  awd_reflood_target_cm: 5,
  flowering_min_depth_cm: 3,
  overflow_depth_cm: 10,
  rain_hold_mm: 20,
  ndvi_drop_per_10_days: 0.05,
  blast_rh_pct: 90,
  blast_temp_min_c: 20,
  blast_temp_max_c: 28,
  blast_consecutive_days: 2,
  dry_day_rain_mm: 2,
  harvest_dry_days: 3,
  harvest_early_days: 3,
  rice_salinity_threshold_ds_m: 3,
  spray_wind_calm_floor_ms: 1.3,
  spray_wind_advisory_ms: 3,
};

function withValue(key: keyof ThresholdValues, value: number): ThresholdValues {
  return { ...DEFAULT_VALUES, [key]: value };
}

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const errorsFor = (values: ThresholdValues) => validate(values).filter((issue) => issue.level === 'error');

test('Paddy settings: defaults equal the backend planner defaults key for key', () => {
  assert.deepEqual({ ...DEFAULT_VALUES }, BACKEND_DEFAULTS);
  assert.equal(THRESHOLDS.length, 16);
});

test('Paddy settings: every threshold has a group, unit, bounds that contain its default and a provenance note', () => {
  const groupIds = new Set(THRESHOLD_GROUPS.map((group) => group.id));
  for (const meta of THRESHOLDS) {
    assert.ok(groupIds.has(meta.group), meta.key);
    assert.ok(meta.unit.length > 0, meta.key);
    assert.ok(meta.min <= meta.defaultValue && meta.defaultValue <= meta.max, meta.key);
    assert.ok(meta.step > 0, meta.key);
    assert.match(meta.provenance, /TO VERIFY/, meta.key);
  }
});

test('Paddy settings: the spray advisory slider tops out at the 5.5 m/s hard ceiling and nothing exposes the ceiling', () => {
  const advisory = THRESHOLDS.find((meta) => meta.key === 'spray_wind_advisory_ms');
  assert.equal(advisory?.max, WIND_CEILING_MS);
  assert.equal(WIND_CEILING_MS, 5.5);
  assert.ok(!THRESHOLDS.some((meta) => /ceiling/i.test(meta.key)));
});

test('Paddy settings: defaults validate without any issue', () => {
  assert.deepEqual(validate(DEFAULT_VALUES), []);
});

test('Paddy settings: advisory at the ceiling passes and above it fails', () => {
  assert.deepEqual(errorsFor(withValue('spray_wind_advisory_ms', 5.5)), []);
  const over = errorsFor(withValue('spray_wind_advisory_ms', 5.6));
  assert.ok(over.some((issue) => issue.key === 'spray_wind_advisory_ms'));
});

test('Paddy settings: advisory of zero or below fails', () => {
  assert.ok(errorsFor(withValue('spray_wind_advisory_ms', 0)).some((i) => i.key === 'spray_wind_advisory_ms'));
  assert.ok(errorsFor(withValue('spray_wind_advisory_ms', -1)).some((i) => i.key === 'spray_wind_advisory_ms'));
});

test('Paddy settings: calm floor must stay strictly below the advisory', () => {
  const equal = { ...DEFAULT_VALUES, spray_wind_calm_floor_ms: 3, spray_wind_advisory_ms: 3 };
  assert.ok(errorsFor(equal).some((issue) => issue.key === 'spray_wind_calm_floor_ms'));
  const above = { ...DEFAULT_VALUES, spray_wind_calm_floor_ms: 4, spray_wind_advisory_ms: 3 };
  assert.ok(errorsFor(above).some((issue) => issue.key === 'spray_wind_calm_floor_ms'));
  const below = { ...DEFAULT_VALUES, spray_wind_calm_floor_ms: 2.9, spray_wind_advisory_ms: 3 };
  assert.deepEqual(errorsFor(below), []);
});

test('Paddy settings: blast minimum temperature must stay strictly below the maximum', () => {
  const equal = { ...DEFAULT_VALUES, blast_temp_min_c: 25, blast_temp_max_c: 25 };
  assert.ok(errorsFor(equal).some((issue) => issue.key === 'blast_temp_min_c'));
});

test('Paddy settings: day-count thresholds must be whole numbers of at least one', () => {
  for (const key of ['blast_consecutive_days', 'harvest_dry_days', 'harvest_early_days'] as const) {
    assert.ok(errorsFor(withValue(key, 0)).some((i) => i.key === key), `${key} zero`);
    assert.ok(errorsFor(withValue(key, 1.5)).some((i) => i.key === key), `${key} fractional`);
    assert.deepEqual(errorsFor(withValue(key, 1)), [], `${key} one`);
  }
});

test('Paddy settings: non-finite numbers are rejected on every key', () => {
  for (const meta of THRESHOLDS) {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.ok(errorsFor(withValue(meta.key, bad)).some((i) => i.key === meta.key), `${meta.key} ${bad}`);
    }
  }
});

test('Paddy settings: values outside the UI bounds are errors', () => {
  const below = errorsFor(withValue('awd_safe_depth_cm', -31));
  assert.ok(below.some((issue) => issue.key === 'awd_safe_depth_cm'));
  const above = errorsFor(withValue('rain_hold_mm', 101));
  assert.ok(above.some((issue) => issue.key === 'rain_hold_mm'));
});

test('Paddy settings: sanity warnings do not block apply', () => {
  const overfilled = { ...DEFAULT_VALUES, awd_reflood_target_cm: 12, overflow_depth_cm: 8 };
  const issues = validate(overfilled);
  assert.ok(issues.some((issue) => issue.level === 'warning' && issue.key === 'awd_reflood_target_cm'));
  assert.equal(hasBlockingIssue(issues), false);
  const flowering = validate({ ...DEFAULT_VALUES, flowering_min_depth_cm: 9, overflow_depth_cm: 8 });
  assert.ok(flowering.some((issue) => issue.level === 'warning' && issue.key === 'flowering_min_depth_cm'));
  assert.equal(hasBlockingIssue(validate(withValue('spray_wind_advisory_ms', 6))), true);
});

test('Paddy settings: toOverrides is empty when every value is a default', () => {
  assert.deepEqual(toOverrides(DEFAULT_VALUES), {});
});

test('Paddy settings: toOverrides returns only the changed key', () => {
  assert.deepEqual(toOverrides(withValue('spray_wind_advisory_ms', 2.5)), { spray_wind_advisory_ms: 2.5 });
});

test('Paddy settings: toOverrides removes floating point noise and keeps day counts whole', () => {
  const noisy = { ...DEFAULT_VALUES, spray_wind_advisory_ms: 0.1 + 0.2 + 2.2, blast_consecutive_days: 3 };
  assert.deepEqual(toOverrides(noisy), { spray_wind_advisory_ms: 2.5, blast_consecutive_days: 3 });
  assert.equal(toOverrides(withValue('harvest_dry_days', 4)).harvest_dry_days, 4);
});

test('Paddy settings: save then load round trips under the versioned key', () => {
  const storage = memoryStorage();
  const values = withValue('awd_safe_depth_cm', -12);
  assert.equal(saveSettings(storage, values), true);
  assert.equal(JSON.parse(storage.data[STORAGE_KEY]).v, SCHEMA_VERSION);
  assert.deepEqual({ ...loadSettings(storage) }, { ...values });
});

test('Paddy settings: load falls back to defaults on missing, corrupt or stale storage', () => {
  assert.deepEqual({ ...loadSettings(memoryStorage()) }, { ...DEFAULT_VALUES });
  assert.deepEqual({ ...loadSettings(memoryStorage({ [STORAGE_KEY]: '{not json' })) }, { ...DEFAULT_VALUES });
  const stale = JSON.stringify({ v: SCHEMA_VERSION + 1, values: { awd_safe_depth_cm: -10 } });
  assert.deepEqual({ ...loadSettings(memoryStorage({ [STORAGE_KEY]: stale })) }, { ...DEFAULT_VALUES });
  assert.deepEqual({ ...loadSettings(null) }, { ...DEFAULT_VALUES });
});

test('Paddy settings: load keeps valid keys, drops unknown keys and resets invalid ones individually', () => {
  const raw = JSON.stringify({
    v: SCHEMA_VERSION,
    values: { awd_safe_depth_cm: -10, rain_hold_mm: 5000, mystery_key: 4, blast_rh_pct: 'wet' },
  });
  const loaded = loadSettings(memoryStorage({ [STORAGE_KEY]: raw }));
  assert.equal(loaded.awd_safe_depth_cm, -10);
  assert.equal(loaded.rain_hold_mm, DEFAULT_VALUES.rain_hold_mm);
  assert.equal(loaded.blast_rh_pct, DEFAULT_VALUES.blast_rh_pct);
  assert.ok(!('mystery_key' in loaded));
});

test('Paddy settings: storage that throws never throws out of load or save', () => {
  const broken: StorageLike = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('quota');
    },
  };
  assert.deepEqual({ ...loadSettings(broken) }, { ...DEFAULT_VALUES });
  assert.equal(saveSettings(broken, DEFAULT_VALUES), false);
});

test('Paddy settings: effectiveFromPlan reads plan thresholds and falls back per key', () => {
  const effective = effectiveFromPlan({
    awd_safe_depth_cm: -12,
    flowering_min_depth_cm: '4',
    rain_hold_mm: null,
    status: 'TO VERIFY against local extension guidance before field use',
  });
  assert.equal(effective.awd_safe_depth_cm, -12);
  assert.equal(effective.flowering_min_depth_cm, 4);
  assert.equal(effective.rain_hold_mm, DEFAULT_VALUES.rain_hold_mm);
  assert.deepEqual({ ...effectiveFromPlan(undefined) }, { ...DEFAULT_VALUES });
});
