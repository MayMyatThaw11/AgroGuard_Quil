import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lintAgriScript } from '../src/lib/rulesEngine.ts';
import { runAquaCropSimulation } from '../src/lib/cropSimulator.ts';
import { checkWindCeiling } from '../src/lib/safety.ts';
import { fetchSoilProfile } from '../src/lib/soilProfile.ts';
import { fetchWeatherForecast } from '../src/lib/weatherForecast.ts';
import { deriveReplayMetrics } from '../src/lib/metrics.ts';

/**
 * Acceptance Gate Test Suite
 * Validates the 5 critical acceptance criteria specified in the product contract:
 * 1. lint rejects prohibited input and cites its rule ID.
 * 2. Simulation stepping completes 120 days under 250 ms and triggers a breakpoint at water stress.
 * 3. Spray is aborted at wind speed above threshold.
 * 4. Territory profile for a Myanmar coordinate returns a 6-layer soil profile and a weather forecast.
 * 5. Replay of a run reproduces identical metrics from the ledger.
 */

test('Acceptance Test 1: Lint rejects prohibited input and cites its rule ID', () => {
  const prohibitedScript = `
farm "Ayeyarwady Delta Enterprise" {
    standard: "ASEAN_ORGANIC_ASOA"
}
parcel field_01 {
    input {
        source: "synthetic_urea"
        rate_kg_ha: 60.0
    }
}
`;
  const result = lintAgriScript(prohibitedScript, 'ASEAN_ORGANIC_ASOA');
  assert.equal(result.valid, false, 'Script with synthetic_urea must fail organic lint');
  assert.ok(result.diagnostics.length > 0, 'Must produce diagnostic');

  const diag = result.diagnostics[0];
  assert.equal(diag.ruleId, 'ASOA-RULE-3.2.1-BIO', 'Must cite rule ID ASOA-RULE-3.2.1-BIO');
  assert.equal(diag.severity, 'BLOCKING');
  assert.match(diag.citation, /Section 3\.2\.1/);
});

test('Acceptance Test 2: Simulation completes 120 days under 250 ms and triggers water stress breakpoint', () => {
  const started = performance.now();
  const sim = runAquaCropSimulation(true);
  const duration = performance.now() - started;

  assert.ok(duration < 250, `Simulation must finish under 250 ms (actual: ${duration.toFixed(2)} ms)`);
  assert.equal(sim.daysSimulated, 120, 'Must simulate all 120 season days');
  assert.equal(sim.dailyTrajectory.length, 120);

  // Check water stress breakpoint trigger
  const stressBreakpoint = sim.breakpointsTriggered.find(b => b.code === 'BREAKPOINT_WATER_STRESS_AWD_TRIGGER');
  assert.ok(stressBreakpoint, 'Must trigger water stress breakpoint');
  assert.ok(stressBreakpoint.day >= 30 && stressBreakpoint.day <= 60);
  assert.match(stressBreakpoint.message, /Perched water depth/);
});

test('Acceptance Test 3: Spray is aborted at wind speed above 5.5 m/s threshold', () => {
  const safeVerdict = checkWindCeiling(4.2);
  assert.equal(safeVerdict.permitted, true);

  const boundaryVerdict = checkWindCeiling(5.5);
  assert.equal(boundaryVerdict.permitted, true);

  const exceededVerdict = checkWindCeiling(6.2);
  assert.equal(exceededVerdict.permitted, false);
  assert.equal(exceededVerdict.rejection.code, 'REJECTED_WIND_EXCEEDED');
  assert.match(exceededVerdict.rejection.detail, /6\.20 m\/s exceeds ceiling 5\.5 m\/s/);
});

test('Acceptance Test 4: Territory profile for Myanmar coordinate returns 6-layer soil profile and weather forecast', async () => {
  const MYANMAR_LAT = 16.9825;
  const MYANMAR_LON = 95.8812;

  // Cached profile or live call
  const soilResult = await fetchSoilProfile({ lat: MYANMAR_LAT, lon: MYANMAR_LON });
  assert.equal(soilResult.kind, 'ok');
  assert.equal(soilResult.value.layers.length, 6, 'Must return exactly 6 SoilGrids depth horizons');

  const weatherResult = await fetchWeatherForecast({ lat: MYANMAR_LAT, lon: MYANMAR_LON });
  assert.equal(weatherResult.kind, 'ok');
  assert.equal(weatherResult.value.days.length, 14, 'Must return 14-day weather forecast');
});

test('Acceptance Test 5: Replay of a run reproduces identical metrics from the ledger', () => {
  // Replaying Day 42 with valve closed must be 100% deterministic
  const run1 = deriveReplayMetrics(42, false);
  const run2 = deriveReplayMetrics(42, false);

  assert.deepEqual(run1, run2, 'Replay metrics must be bit-for-bit identical across multiple evaluations');
  assert.equal(run1.canopyHeightPercent, 35);
  assert.equal(run1.waterTableDepthMeters, -0.13);
  assert.equal(run1.matricPotentialKpa, -53.6);
  assert.equal(run1.biomass, 4.2);
});
