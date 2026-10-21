import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAT_KEEP_LAYERS, basemapStyle } from '../../src/features/farm-simulation/lib/farmmap/basemapTheme.ts';
import { HOVER_LAYERS, LAYER_MAP, PLAIN_SOURCES, buildDataLayers } from '../../src/features/farm-simulation/lib/farmmap/dataLayersTheme.ts';
import { DEFAULT_LAYERS, LAYER_GROUPS } from '../../src/features/farm-simulation/lib/farmmap/farmMapLayerKeys.ts';

const style = basemapStyle();
const baseIds = style.layers.map((layer) => layer.id);
const dataLayers = buildDataLayers();
const dataIds = dataLayers.map((entry) => entry.spec.id);
const allIds = new Set([...baseIds, ...dataIds]);
const sourceIds = new Set([...Object.keys(style.sources), ...PLAIN_SOURCES, 'aq-farms']);

test('Farm map style: layer ids are unique across basemap and data layers', () => {
  assert.equal(allIds.size, baseIds.length + dataIds.length);
});

test('Farm map style: every layer reads from a declared source', () => {
  [...style.layers, ...dataLayers.map((entry) => entry.spec)].forEach((layer) => {
    if ('source' in layer && layer.source) assert.ok(sourceIds.has(layer.source), `${layer.id} uses unknown source ${layer.source}`);
  });
});

test('Farm map style: insert-before targets exist and come earlier in the stack', () => {
  const seen = new Set(baseIds);
  dataLayers.forEach(({ spec, before }) => {
    if (before) assert.ok(seen.has(before), `${spec.id} inserts before missing layer ${before}`);
    seen.add(spec.id);
  });
});

test('Farm map style: satellite keeps only layers that exist in the basemap', () => {
  SAT_KEEP_LAYERS.forEach((id) => assert.ok(baseIds.includes(id), `${id} is not a basemap layer`));
});

test('Farm map style: layer toggles and hover targets point at real layers', () => {
  Object.values(LAYER_MAP).flat().forEach((id) => assert.ok(dataIds.includes(id), `${id} is not a data layer`));
  HOVER_LAYERS.forEach((id) => assert.ok(dataIds.includes(id), `${id} is not a data layer`));
});

test('Farm map style: every layer toggle has a default and a panel row', () => {
  const keys = Object.keys(LAYER_MAP).sort();
  assert.deepEqual(Object.keys(DEFAULT_LAYERS).sort(), keys);
  assert.deepEqual(LAYER_GROUPS.flatMap(([, rows]) => rows.map((row) => row[0])).sort(), keys);
});

test('Farm map style: the basemap uses keyless public sources only', () => {
  const urls = JSON.stringify(style.sources);
  assert.ok(!/key=|apikey|access_token/i.test(urls));
});

test('Farm map style: your own farm draws above every seeded farm layer and is hoverable', () => {
  const ownIds = ['own-fill', 'own-line', 'own-point', 'own-label'];
  ownIds.forEach((id) => assert.ok(dataIds.includes(id), `${id} is missing`));
  const seeded = ['paddies', 'crops', 'bounds', 'farm-pins', 'farm-labels'].map((id) => dataIds.indexOf(id));
  const lowestOwn = Math.min(...ownIds.map((id) => dataIds.indexOf(id)));
  assert.ok(seeded.every((i) => i < lowestOwn), 'a seeded layer draws above your farm');
  assert.ok(HOVER_LAYERS.includes('own-fill') && HOVER_LAYERS.includes('own-point'));
  assert.ok(PLAIN_SOURCES.includes('aq-own'));
  dataLayers.filter((e) => ownIds.includes(e.spec.id)).forEach((e) => assert.equal(e.before, undefined));
});
