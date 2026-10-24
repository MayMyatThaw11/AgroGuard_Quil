import assert from 'node:assert/strict';
import test from 'node:test';
import { CLOUD_BOX_M, CLOUD_HEIGHT_M, FLASH_CAP_PER_S, cloudCount, cloudPlan, dropCount, flashAllowed, fogScale, lightScale, previewWeather, weatherKey } from '../../src/features/farm-simulation/lib/farmview/weatherFx.ts';

test('rain drops scale with intensity and halve on weak devices', () => {
  const rain = previewWeather('rain', false);
  const storm = previewWeather('storm', false);
  assert.ok(dropCount(storm, false) > dropCount(rain, false));
  assert.equal(dropCount(rain, true), Math.floor(dropCount(rain, false) / 2));
  assert.equal(dropCount(previewWeather('clear', false), false), 0);
});

test('reduced motion draws no moving drops', () => {
  assert.equal(dropCount(previewWeather('rain', true), false), 0);
});

test('lightning never flashes more than three times in one second', () => {
  const times: number[] = [];
  let allowed = 0;
  for (let t = 0; t < 2; t += 0.05) {
    if (flashAllowed(times, t)) {
      times.push(t);
      allowed += 1;
    }
  }
  assert.ok(allowed <= FLASH_CAP_PER_S * 2);
  assert.equal(FLASH_CAP_PER_S, 3);
  assert.equal(flashAllowed([0, 0.1, 0.2], 0.3), false);
  assert.equal(flashAllowed([0, 0.1, 0.2], 1.05), true);
});

test('fog thickens the haze and a storm darkens the light', () => {
  assert.equal(fogScale(previewWeather('clear', false)), 1);
  assert.ok(fogScale(previewWeather('fog', false)) > fogScale(previewWeather('rain', false)));
  assert.equal(lightScale(previewWeather('clear', false)) > lightScale(previewWeather('storm', false)), true);
  assert.ok(lightScale(previewWeather('storm', false)) > 0);
});

test('each condition has a plain label key, and a missing reading has none', () => {
  assert.equal(weatherKey(previewWeather('clear', false)), 'farmMap.farmView.wx.clear');
  assert.equal(weatherKey(previewWeather('rain', false)), 'farmMap.farmView.wx.rain');
  assert.equal(weatherKey(previewWeather('storm', false)), 'farmMap.farmView.wx.storm');
  assert.equal(weatherKey(previewWeather('fog', false)), 'farmMap.farmView.wx.fog');
  assert.equal(weatherKey(previewWeather('night', false)), 'farmMap.farmView.wx.night');
  assert.equal(weatherKey({ ...previewWeather('clear', false), available: false }), null);
});

test('clouds follow the cloud cover reading, none under a fifth, fewer on weak devices', () => {
  assert.equal(cloudCount(0.1, false), 0);
  assert.equal(cloudCount(0.5, false), 5);
  assert.equal(cloudCount(1, false), 10);
  assert.equal(cloudCount(1, true), 5);
});

test('cloud places are the same for the same farm and stay inside the sky box', () => {
  const a = cloudPlan(6, 'AQ-ID-0641');
  const b = cloudPlan(6, 'AQ-ID-0641');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, cloudPlan(6, 'AQ-PH-0921'));
  assert.equal(a.length, 6);
  for (const c of a) {
    assert.ok(Math.abs(c.x) <= CLOUD_BOX_M && Math.abs(c.z) <= CLOUD_BOX_M);
    assert.ok(c.y >= CLOUD_HEIGHT_M[0] && c.y <= CLOUD_HEIGHT_M[1]);
    assert.ok(c.s > 0);
  }
});

test('night is much darker than a clear day', () => {
  assert.ok(lightScale(previewWeather('night', false)) < lightScale(previewWeather('clear', false)) * 0.5);
});
