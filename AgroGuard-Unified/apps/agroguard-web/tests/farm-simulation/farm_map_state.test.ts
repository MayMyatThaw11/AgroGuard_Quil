import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFarmMap } from '../../src/features/farm-simulation/lib/farmmap/farmMapData.ts';
import { DEFAULT_LAYERS } from '../../src/features/farm-simulation/lib/farmmap/farmMapLayerKeys.ts';
import { BASE_STOP, draftForFarm, draftForPoi, routeOptions } from '../../src/features/farm-simulation/lib/farmmap/farmMapRoutes.ts';
import { CAMERA_KEY, LAYERS_KEY, loadCamera, loadLayers, saveCamera, saveLayers } from '../../src/features/farm-simulation/lib/farmmap/farmMapStorage.ts';
import type { StorageLike } from '../../src/features/farm-simulation/lib/paddySettings.ts';

function memory(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

const throwing: StorageLike = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
const map = getFarmMap();

test('Farm map storage: layers fall back to defaults when nothing is saved', () => {
  assert.deepEqual(loadLayers(null), DEFAULT_LAYERS);
  assert.deepEqual(loadLayers(memory()), DEFAULT_LAYERS);
});

test('Farm map storage: layers round trip and keep unknown or bad values out', () => {
  const storage = memory();
  saveLayers(storage, { ...DEFAULT_LAYERS, soil: true, paddies: false });
  const loaded = loadLayers(storage);
  assert.equal(loaded.soil, true);
  assert.equal(loaded.paddies, false);
  const dirty = memory({ [LAYERS_KEY]: JSON.stringify({ soil: 'yes', ghost: true, flood: true }) });
  const merged = loadLayers(dirty);
  assert.equal(merged.soil, DEFAULT_LAYERS.soil);
  assert.equal(merged.flood, true);
  assert.ok(!('ghost' in merged));
});

test('Farm map storage: corrupt JSON and blocked storage never throw', () => {
  assert.deepEqual(loadLayers(memory({ [LAYERS_KEY]: '{oops' })), DEFAULT_LAYERS);
  assert.deepEqual(loadLayers(throwing), DEFAULT_LAYERS);
  assert.equal(loadCamera(throwing), null);
  saveLayers(throwing, DEFAULT_LAYERS);
  saveCamera(throwing, { center: [1, 1], zoom: 3, bearing: 0, pitch: 0 });
});

test('Farm map storage: camera round trips and rejects invalid shapes', () => {
  const storage = memory();
  const camera = { center: [95.6, 16.7] as [number, number], zoom: 10.4, bearing: -12, pitch: 35 };
  saveCamera(storage, camera);
  assert.deepEqual(loadCamera(storage), camera);
  assert.equal(loadCamera(memory({ [CAMERA_KEY]: JSON.stringify({ center: [999, 0], zoom: 1, bearing: 0, pitch: 0 }) })), null);
  assert.equal(loadCamera(memory({ [CAMERA_KEY]: JSON.stringify({ center: [1, 2], zoom: 'x', bearing: 0, pitch: 0 }) })), null);
  assert.equal(loadCamera(memory({ [CAMERA_KEY]: JSON.stringify({ zoom: 3 }) })), null);
});

test('Farm map routes: options start at the field office and stay inside one anchor', () => {
  const farm = map.farms[0];
  const options = routeOptions(map, farm.anchor, farm);
  assert.equal(options[0].id, BASE_STOP);
  assert.equal(options[1].id, farm.id);
  assert.equal(new Set(options.map((o) => o.id)).size, options.length);
});

test('Farm map routes: a farm draft heads for the nearest market', () => {
  const farm = map.farms[0];
  const draft = draftForFarm(map, farm);
  assert.equal(draft.from, farm.id);
  assert.equal(map.poiById[draft.to].type, 'market');
});

test('Farm map routes: a poi draft starts from its farm when it has one', () => {
  const machine = map.pois.find((p) => p.type === 'machine');
  assert.ok(machine && machine.type === 'machine');
  assert.equal(draftForPoi(map, machine).from, machine.farm);
  const market = map.pois.find((p) => p.type === 'market');
  assert.ok(market);
  const draft = draftForPoi(map, market);
  assert.equal(draft.from, BASE_STOP);
  assert.equal(draft.to, market.id);
});
