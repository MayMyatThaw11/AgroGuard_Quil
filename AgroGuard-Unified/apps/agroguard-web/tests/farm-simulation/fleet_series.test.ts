import { test } from 'node:test';
import assert from 'node:assert/strict';
import { axisLabels, depthSeries } from '../../src/features/farm-simulation/lib/fleetSeries.ts';

test('Fleet series: observed depth ends on the current water level and the forecast ends on the lowest ahead', () => {
  const series = depthSeries('PD-02', -9, -11.4);
  assert.equal(series.observed.length, 26);
  assert.equal(series.forecast.length, 6);
  assert.equal(series.band.length, 6);
  assert.ok(Math.abs(series.observed[25] - -9) < 0.011);
  assert.equal(series.forecast[0], -9);
  assert.equal(series.forecast[5], -11.4);
});

test('Fleet series: the uncertainty band opens up over the horizon and brackets the forecast', () => {
  const series = depthSeries('PD-05', -4.2, -6);
  series.band.forEach(([low, high], i) => {
    assert.ok(low <= series.forecast[i] && high >= series.forecast[i]);
  });
  const width = (i: number) => series.band[i][1] - series.band[i][0];
  for (let i = 1; i < 6; i += 1) assert.ok(width(i) > width(i - 1));
});

test('Fleet series: the series is deterministic and differs between paddies', () => {
  assert.deepEqual(depthSeries('PD-03', -6.6, -8.9), depthSeries('PD-03', -6.6, -8.9));
  assert.notDeepEqual(depthSeries('PD-03', -6.6, -8.9).observed, depthSeries('PD-04', -6.6, -8.9).observed);
});

test('Fleet series: axis labels mark every ten days from 25 days back to 5 days ahead', () => {
  const labels = axisLabels(new Date(Date.UTC(2026, 9, 11)));
  assert.deepEqual(labels, ['16 Sep', '26 Sep', '6 Oct', '16 Oct']);
});
