import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPS_FARM,
  HISTORY_DAYS,
  HORIZON_DAYS,
  buildHistory,
  buildForecastWeather,
  forecastDates,
} from '../src/data/ops/fixture.ts';
import { useOpsStore } from '../src/store/opsStore.ts';

const START = new Date(Date.UTC(2026, 9, 10));

test('Ops fixture: assets are numbered 1..n with unique ids and known kinds', () => {
  const numbers = OPS_FARM.assets.map((a) => a.number).sort((a, b) => a - b);
  assert.deepEqual(numbers, OPS_FARM.assets.map((_, i) => i + 1));
  assert.equal(new Set(OPS_FARM.assets.map((a) => a.id)).size, OPS_FARM.assets.length);
  const kinds = new Set(['pump', 'gate', 'sluice', 'drone', 'tractor', 'robot']);
  for (const asset of OPS_FARM.assets) assert.ok(kinds.has(asset.kind), asset.id);
});

test('Ops fixture: every served paddy exists', () => {
  const ids = new Set(OPS_FARM.paddies.map((p) => p.id));
  for (const asset of OPS_FARM.assets) {
    for (const served of asset.serves) assert.ok(ids.has(served), `${asset.id} serves ${served}`);
  }
});

test('Ops fixture: history is deterministic, complete and physically bounded', () => {
  const a = buildHistory(OPS_FARM, START);
  const b = buildHistory(OPS_FARM, START);
  assert.deepEqual(a, b);
  assert.equal(a.weather.length, HISTORY_DAYS);
  assert.equal(a.dates.length, HISTORY_DAYS);
  assert.equal(a.dates[HISTORY_DAYS - 1], '2026-10-09');
  for (const paddy of OPS_FARM.paddies) {
    assert.equal(a.depthCm[paddy.id].length, HISTORY_DAYS);
    assert.ok(a.depthCm[paddy.id].every((d) => d >= -24 && d <= 8), `${paddy.id} depth bounds`);
    assert.ok(a.ndvi[paddy.id].every((v) => v > 0 && v < 1), `${paddy.id} ndvi bounds`);
  }
});

test('Ops fixture: forecast weather and dates cover the horizon', () => {
  const weather = buildForecastWeather();
  assert.equal(weather.length, HORIZON_DAYS);
  const dates = forecastDates(START);
  assert.equal(dates[0], '2026-10-10');
  assert.equal(dates.length, HORIZON_DAYS);
});

test('Ops store: plan lifecycle moves through loading, ready and offline', () => {
  const store = useOpsStore.getState();
  store.setPlanLoading();
  assert.equal(useOpsStore.getState().planStatus, 'loading');
  store.setPlanOffline('HTTP 502');
  assert.equal(useOpsStore.getState().planStatus, 'offline');
  assert.equal(useOpsStore.getState().planError, 'HTTP 502');
  store.select({ kind: 'asset', id: 'P-01' });
  assert.deepEqual(useOpsStore.getState().selection, { kind: 'asset', id: 'P-01' });
});
