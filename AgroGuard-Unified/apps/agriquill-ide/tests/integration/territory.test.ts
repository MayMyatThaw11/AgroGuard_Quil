/**
 * Integration tests against the live upstream APIs. These are the checks that
 * back docs/agriquill/TESTING.md Check A. They hit the real services, so they
 * are excluded from `npm test` and run via `npm run test:integration`.
 *
 * Every assertion pins a property that was verified against a live response
 * on 2026-10-05, not a shape guessed from documentation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SOIL_DEPTH_LABELS, clearSoilCache, fetchSoilProfile } from '../../src/lib/soilProfile.ts';
import { FORECAST_DAYS, fetchWeatherForecast } from '../../src/lib/weatherForecast.ts';
import { clearResponseCache } from '../../src/lib/http.ts';

/** coords pinned by docs/agriquill/TESTING.md Check A */
const CHECK_A_LAT = 16.9825;
const CHECK_A_LON = 95.8812;

test('Check A: soil profile returns exactly six ISRIC horizons', async () => {
  clearResponseCache();
  clearSoilCache();
  const outcome = await fetchSoilProfile({ lat: CHECK_A_LAT, lon: CHECK_A_LON });
  assert.equal(outcome.kind, 'ok', `upstream failed: ${JSON.stringify(outcome)}`);

  const profile = outcome.value;
  assert.equal(profile.layers.length, 6);
  assert.deepEqual(
    profile.layers.map(l => l.depth),
    [...SOIL_DEPTH_LABELS]
  );
});

test('Check A: soil values are physically plausible after unit conversion', async () => {
  clearResponseCache();
  clearSoilCache();
  const outcome = await fetchSoilProfile({ lat: CHECK_A_LAT, lon: CHECK_A_LON });
  assert.equal(outcome.kind, 'ok');

  for (const layer of outcome.value.layers) {
    const grain = layer.clayPercent + layer.sandPercent + layer.siltPercent;
    assert.ok(grain > 0 && grain <= 105, `${layer.depth} particle fractions sum ${grain}`);
    assert.ok(layer.phWater > 3 && layer.phWater < 10, `${layer.depth} pH ${layer.phWater} implausible`);
    assert.ok(layer.organicCarbonGKg >= 0 && layer.organicCarbonGKg < 100);
    assert.ok(layer.cecCmolcKg >= 0 && layer.cecCmolcKg < 50);
    assert.ok(layer.bottomDepthCm > layer.topDepthCm);
  }
});

test('Check A: soil response is echoed at the requested coordinates', async () => {
  clearResponseCache();
  clearSoilCache();
  const outcome = await fetchSoilProfile({ lat: CHECK_A_LAT, lon: CHECK_A_LON });
  assert.equal(outcome.kind, 'ok');
  assert.ok(Math.abs(outcome.value.latitude - CHECK_A_LAT) < 0.01);
  assert.ok(Math.abs(outcome.value.longitude - CHECK_A_LON) < 0.01);
});

test('Check A: forecast returns 14 days with Tmin, Tmax, rain and wind', async () => {
  clearResponseCache();
  clearSoilCache();
  const outcome = await fetchWeatherForecast({ lat: CHECK_A_LAT, lon: CHECK_A_LON });
  assert.equal(outcome.kind, 'ok', `upstream failed: ${JSON.stringify(outcome)}`);

  const forecast = outcome.value;
  assert.equal(forecast.days.length, FORECAST_DAYS);
  for (const day of forecast.days) {
    assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(day.tempMaxC >= day.tempMinC, `${day.date} max below min`);
    assert.ok(day.tempMinC > -90 && day.tempMaxC < 65);
    assert.ok(day.precipitationMm >= 0);
    assert.ok(day.windMaxMs >= 0 && day.windMaxMs < 150);
  }
});

test('wind is reported in m/s after conversion from the upstream unit', async () => {
  clearResponseCache();
  clearSoilCache();
  const outcome = await fetchWeatherForecast({ lat: CHECK_A_LAT, lon: CHECK_A_LON });
  assert.equal(outcome.kind, 'ok');

  const first = outcome.value.days[0];
  // Upstream was verified to report km/h; the adapter must not leak that unit
  // into a field the 5.5 m/s guard reads.
  assert.equal(first.windUnitAsReported, 'km/h');
  assert.ok(first.windMaxMs < 120, 'converted m/s value is implausibly large');
});

test('out-of-range coordinates are refused before any network call', async () => {
  const outcome = await fetchSoilProfile({ lat: 200, lon: 0 });
  assert.equal(outcome.kind, 'error');
  assert.equal(outcome.reason.type, 'contract');
});

test('a non-contract day count is refused against the documented 14', async () => {
  const outcome = await fetchWeatherForecast({ lat: CHECK_A_LAT, lon: CHECK_A_LON, days: 7 });
  assert.equal(outcome.kind, 'error');
  assert.equal(outcome.reason.type, 'contract');
});

test('second identical soil request is served from cache', async () => {
  clearResponseCache();
  clearSoilCache();
  const cold = await fetchSoilProfile({ lat: CHECK_A_LAT, lon: CHECK_A_LON });
  assert.equal(cold.kind, 'ok');
  const warm = await fetchSoilProfile({ lat: CHECK_A_LAT, lon: CHECK_A_LON });
  assert.equal(warm.kind, 'ok');
  assert.equal(warm.fromCache, true);
  assert.equal(warm.value.fromCache, true);
});

test('territory profile meets the cached latency target', async () => {
  clearResponseCache();
  clearSoilCache();
  await fetchSoilProfile({ lat: CHECK_A_LAT, lon: CHECK_A_LON });
  const started = performance.now();
  const cached = await fetchSoilProfile({ lat: CHECK_A_LAT, lon: CHECK_A_LON });
  const elapsed = performance.now() - started;

  assert.equal(cached.kind, 'ok');
  assert.ok(elapsed < 800, `cached soil fetch took ${elapsed.toFixed(1)} ms, target is < 800 ms`);
});