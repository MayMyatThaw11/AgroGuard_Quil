import assert from 'node:assert/strict';
import test from 'node:test';
import type { LivePlan } from '../../src/features/farm-simulation/data/ops/types.ts';
import { blockedLabel, slotLabel, toLiveView } from '../../src/features/farm-simulation/lib/liveOps.ts';
import { observedDates } from '../../src/features/farm-simulation/components/ops/crewMeta.ts';

const day = (date: string, rain = 0, wind = 2) => ({
  date,
  hours: 24,
  rain_mm: rain,
  temp_c: 29,
  rh_pct: 80,
  wind_ms: wind,
  et0_mm: 4,
});

const LIVE: LivePlan = {
  farm_id: 'farm_ayeyarwady_demo',
  status: 'OK',
  local_now: '2026-10-14T09:00',
  contract_sha256: 'sha256:abc',
  weather: {
    source: { provider: 'Open-Meteo forecast API (hourly)', url: 'u', retrieved_at: 't', sha256: 'sha256:0123456789abcdef0123' },
    stale: false,
    timezone: 'Asia/Yangon',
    licence: 'non-commercial',
    days: [day('2026-10-14'), day('2026-10-15', 12, 6.3)],
    past_days: [day('2026-10-12'), day('2026-10-13')],
  },
  paddies: [
    { id: 'PD-02', device_id: 'PD-02-tube', source: 'DERIVED', now: -9, missing: [] },
    { id: 'PD-03', device_id: 'PD-03-tube', missing: [{ field: 'water_depth', reason: 'no reading from PD-03-tube' }] },
    { id: 'PD-06', device_id: 'PD-06-tube', source: 'MEASURED', series: [4, 3.5], missing: [] },
  ],
  forecast_series: { 'PD-02': { p10: [-9.5, -10], p50: [-9.5, -10], p90: [-9.5, -10] } },
  tasks: [],
  schedule: { status: 'OPTIMAL', solver: 'CP-SAT (OR-Tools)', scheduled: 0, blocked: 0 },
  crew: [],
  thresholds: {},
  approval_policy: 'proposal only',
  missing: [],
};

test('live plan maps real weather and keeps unknown depth unknown', () => {
  const view = toLiveView(LIVE);
  assert.ok(view);
  assert.deepEqual(view.forecastDates, ['2026-10-14', '2026-10-15']);
  assert.equal(view.forecastWeather[1].windMs, 6.3);
  assert.equal(view.water['PD-02'].value, -9);
  assert.equal(view.water['PD-02'].source, 'DERIVED');
  assert.equal(view.water['PD-03'].value, null);
  assert.match(view.water['PD-03'].reason ?? '', /no reading/);
  assert.deepEqual(view.history.depthCm['PD-03'], []);
  assert.deepEqual(view.history.ndvi['PD-02'], []);
  assert.equal(view.plan.forecast.series['PD-02'].p50[1], -10);
  assert.match(view.sourceLabel, /Open-Meteo/);
});

test('a plan without weather is not turned into a view', () => {
  assert.equal(toLiveView({ ...LIVE, status: 'NO_WEATHER', weather: undefined }), null);
});

test('derived single reading is dated today, measured series by past days', () => {
  const view = toLiveView(LIVE);
  assert.ok(view);
  assert.deepEqual(observedDates(view.history, [-9]), ['2026-10-14']);
  assert.deepEqual(observedDates(view.history, [4, 3.5]), ['2026-10-12', '2026-10-13']);
});

test('schedule slots and gate reasons read as plain language', () => {
  assert.match(slotLabel('2026-10-15T05:00', '2026-10-15T08:00') ?? '', /05:00–08:00/);
  assert.equal(slotLabel(undefined), null);
  assert.match(blockedLabel('NO_GATE_WINDOW:wind:6.3>5.5') ?? '', /wind above the limit \(6\.3>5\.5\)/);
  assert.match(blockedLabel('NO_GATE_WINDOW:washout:12 mm in 6 h>10.0') ?? '', /rain within 6 h/);
  assert.equal(blockedLabel('REJECTED_WIND_EXCEEDED'), 'REJECTED_WIND_EXCEEDED');
});
