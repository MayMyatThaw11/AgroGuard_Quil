import assert from 'node:assert/strict';
import test from 'node:test';
import { benchmarkKey, benchmarkLine, parseFarmWeather, weatherLabel } from '../src/lib/farmmap/farmLive.ts';
import { getFarmMap } from '../src/lib/farmmap/farmMapData.ts';

const BODY = {
  elevation: 512,
  current: { time: '2026-10-14T12:00', temperature_2m: 27.4, relative_humidity_2m: 81, precipitation: 0, wind_speed_10m: 3.2, weather_code: 2 },
  daily: {
    time: ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'],
    temperature_2m_max: [30, 31, 30, 29.6, 30.2, 28.9, 29],
    temperature_2m_min: [22, 22, 21, 21.4, 21.9, 20.8, 21],
    precipitation_sum: [4, 0, 6.5, 1.2, 0, 12.4, 3],
    precipitation_probability_max: [null, null, null, 40, 10, 85, 60],
  },
};

test('Open-Meteo farm weather keeps real elevation, past rain and the next three days', () => {
  const w = parseFarmWeather(BODY, '2026-10-14');
  assert.equal(w.elevationM, 512);
  assert.equal(w.windMs, 3.2);
  assert.equal(w.rain30Mm, 10.5);
  assert.deepEqual(w.days.map((d) => d.date), ['2026-10-14', '2026-10-15', '2026-10-16']);
  assert.equal(w.days[0].hi, 30);
  assert.equal(w.code, 'Partly cloudy');
});

test('missing values stay unknown instead of being invented', () => {
  const w = parseFarmWeather({ current: {}, daily: {} }, '2026-10-14');
  assert.equal(w.elevationM, null);
  assert.equal(w.windMs, null);
  assert.equal(w.rain30Mm, null);
  assert.deepEqual(w.days, []);
  assert.equal(weatherLabel(null).code, 'Unknown');
  assert.equal(weatherLabel(95).icon, 'cloud-lightning');
});

test('benchmarks match crop and country and say so when there is none', () => {
  assert.equal(benchmarkKey('rice', 'Vietnam'), 'rice_vn');
  assert.equal(benchmarkKey('coffee', 'Vietnam'), 'coffee');
  assert.match(
    benchmarkLine({ status: 'ready', value: { benchmark: { series: 'Coffee, Robusta', month: '2026-09', usd_per_tonne: 3690 }, provider: 'WB' } }),
    /Coffee, Robusta: 3,690 USD\/t, 2026-09/
  );
  assert.equal(benchmarkLine({ status: 'ready', value: { benchmark: null, provider: 'WB' } }), 'No public world benchmark for this crop');
});

test('markets carry no invented price and only grain towns get grain silos', () => {
  const map = getFarmMap();
  for (const poi of map.pois) {
    assert.equal('price' in poi, false);
    if (poi.type === 'storage' && /Silo|Grain/.test(poi.label)) {
      const crop = map.anchorById[poi.anchor].crop;
      assert.ok(crop === 'rice' || crop === 'maize', `${poi.label} is in a ${crop} town`);
    }
  }
});
