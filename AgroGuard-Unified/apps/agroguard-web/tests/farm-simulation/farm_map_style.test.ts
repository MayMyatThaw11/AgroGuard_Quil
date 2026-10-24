import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAT_KEEP_LAYERS, basemapStyle } from '../../src/features/farm-simulation/lib/farmmap/basemapTheme.ts';
import { FIELD_FILL_OPACITY, HOVER_LAYERS, LAYER_MAP, PLAIN_SOURCES, RELIEF_LAYERS, buildDataLayers, reliefVisibility } from '../../src/features/farm-simulation/lib/farmmap/dataLayersTheme.ts';
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

const layerOf = (id: string) => dataLayers.find((entry) => entry.spec.id === id)?.spec;
const minZoomOf = (id: string) => {
  const spec = layerOf(id);
  return spec && 'minzoom' in spec ? spec.minzoom ?? 0 : Number.NaN;
};
const paintOf = (id: string) => (layerOf(id) as { paint?: Record<string, unknown> } | undefined)?.paint ?? {};

test('Farm map style: every farm is marked from the overview zoom and its boundary from regional zoom', () => {
  assert.equal(layerOf('farm-halo')?.type, 'circle');
  assert.ok(LAYER_MAP.bounds.includes('farm-halo'));
  assert.ok(minZoomOf('bounds') <= 8, 'farm boundaries start too late');
  assert.ok(minZoomOf('bounds-fill') <= 8 && minZoomOf('bounds-halo') <= 8);
  assert.ok(minZoomOf('field-edges') <= 10, 'field outlines start too late');
});

test('Farm map style: the farm boundary is a solid outline over a casing and a glow, all toggled with the boundary layer', () => {
  ['bounds-fill', 'bounds-halo', 'bounds-case', 'bounds', 'farm-halo'].forEach((id) => assert.ok(LAYER_MAP.bounds.includes(id), `${id} is not toggled with the boundary layer`));
  assert.equal(paintOf('bounds')['line-dasharray'], undefined);
  assert.equal(paintOf('bounds')['line-opacity'], 1);
  assert.ok(dataIds.indexOf('bounds-halo') < dataIds.indexOf('bounds-case') && dataIds.indexOf('bounds-case') < dataIds.indexOf('bounds'));
});

test('Farm map style: field outlines carry the farm status and satellite does not dim the fields', () => {
  assert.ok(JSON.stringify(paintOf('field-edges')['line-color']).includes('"risk"'));
  assert.ok(FIELD_FILL_OPACITY.satellite >= 0.7 && FIELD_FILL_OPACITY.map >= 0.9);
});

test('Farm map style: 3D field relief starts hidden and follows the terrain switch and the layer toggles', () => {
  Object.keys(RELIEF_LAYERS).forEach((id) => {
    const spec = dataLayers.find((e) => e.spec.id === id)?.spec;
    assert.equal(spec?.type, 'fill-extrusion', `${id} is not a fill-extrusion`);
    assert.equal(spec && 'layout' in spec ? spec.layout?.visibility : undefined, 'none');
  });
  assert.deepEqual(reliefVisibility(false, DEFAULT_LAYERS), { 'paddies-3d': 'none', 'crops-3d': 'none', 'own-3d': 'none', 'own-water': 'none' });
  assert.deepEqual(reliefVisibility(true, DEFAULT_LAYERS), { 'paddies-3d': 'visible', 'crops-3d': 'visible', 'own-3d': 'visible', 'own-water': 'visible' });
  assert.deepEqual(reliefVisibility(true, { ...DEFAULT_LAYERS, paddies: false }), { 'paddies-3d': 'none', 'crops-3d': 'visible', 'own-3d': 'visible', 'own-water': 'visible' });
});
