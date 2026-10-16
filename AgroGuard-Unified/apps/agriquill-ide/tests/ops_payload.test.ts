import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPS_FARM, buildForecastWeather, buildHistory } from '../src/data/ops/fixture.ts';
import { buildOpsPlanRequest } from '../src/lib/opsPayload.ts';

const START = new Date(Date.UTC(2026, 9, 10));
const history = buildHistory(OPS_FARM, START);
const forecastWeather = buildForecastWeather();

function build(overrides: Partial<Record<string, number>> = {}) {
  return buildOpsPlanRequest({ farm: OPS_FARM, start: START, history, forecastWeather, overrides });
}

test('Ops payload: carries the farm identity, start date and one entry per paddy and asset', () => {
  const request = build();
  assert.equal(request.farm_id, OPS_FARM.id);
  assert.equal(request.country, OPS_FARM.country);
  assert.equal(request.standard, OPS_FARM.standard);
  assert.equal(request.start_date, '2026-10-10');
  assert.equal(request.paddies.length, OPS_FARM.paddies.length);
  assert.equal(request.assets.length, OPS_FARM.assets.length);
});

test('Ops payload: paddy series and weather use the wire field names', () => {
  const request = build();
  const first = OPS_FARM.paddies[0];
  const wire = request.paddies[0];
  assert.equal(wire.id, first.id);
  assert.equal(wire.crop_id, first.cropId);
  assert.equal(wire.days_since_planting, first.daysSincePlanting);
  assert.deepEqual(wire.water_depth_cm, history.depthCm[first.id]);
  assert.deepEqual(wire.ndvi, history.ndvi[first.id]);
  assert.deepEqual(request.weather_history[0], {
    rain_mm: history.weather[0].rainMm,
    temp_c: history.weather[0].tempC,
    rh_pct: history.weather[0].rhPct,
    wind_ms: history.weather[0].windMs,
  });
  assert.equal(request.weather_forecast.length, forecastWeather.length);
  assert.equal(request.assets[0].status, OPS_FARM.assets[0].status.toLowerCase());
});

test('Ops payload: omits threshold_overrides when there are none', () => {
  assert.ok(!('threshold_overrides' in build({})));
});

test('Ops payload: includes exactly the overrides it is given', () => {
  assert.deepEqual(build({ spray_wind_advisory_ms: 2.5 }).threshold_overrides, { spray_wind_advisory_ms: 2.5 });
});

test('Ops payload: sends the farm location so the plan is recorded against the place', () => {
  const request = build();
  assert.equal(request.lat, OPS_FARM.lat);
  assert.equal(request.lon, OPS_FARM.lon);
  const unlocated = buildOpsPlanRequest({ farm: { ...OPS_FARM, lat: undefined, lon: undefined }, start: START, history, forecastWeather, overrides: {} });
  assert.equal('lat' in unlocated, false);
  assert.equal('lon' in unlocated, false);
});
