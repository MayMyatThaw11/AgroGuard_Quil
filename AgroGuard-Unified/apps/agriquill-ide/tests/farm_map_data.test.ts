import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR_ROWS } from '../src/lib/farmmap/farmMapAnchors.ts';
import { buildFarmMap, getFarmMap } from '../src/lib/farmmap/farmMapData.ts';
import { buildChunk, fieldsOf } from '../src/lib/farmmap/farmMapGeometry.ts';
import { chunkKey } from '../src/lib/farmmap/farmMapRandom.ts';
import { nearestPoi, parseCoordinates, searchFarmMap } from '../src/lib/farmmap/farmMapSearch.ts';
import { ASEAN_BOUNDS } from '../src/lib/farmmap/farmMapRegions.ts';
import { localTime, weatherOf, windMs } from '../src/lib/farmmap/farmMapWeather.ts';

const NOW = Date.UTC(2026, 9, 12, 6, 30);
const map = getFarmMap();

test('Farm map: generation is deterministic', () => {
  const again = buildFarmMap();
  assert.equal(again.farms.length, map.farms.length);
  assert.deepEqual(again.farms[0], map.farms[0]);
  assert.deepEqual(again.pois[10], map.pois[10]);
});

test('Farm map: farm count matches the anchor table and ids are unique', () => {
  const expected = ANCHOR_ROWS.reduce((sum, row) => sum + row[7], 0);
  assert.equal(map.farms.length, expected);
  assert.equal(new Set(map.farms.map((f) => f.id)).size, map.farms.length);
  assert.equal(new Set(map.pois.map((p) => p.id)).size, map.pois.length);
});

test('Farm map: covers all 11 ASEAN countries', () => {
  assert.equal(map.countries.length, 11);
});

test('Farm map: every farm and poi sits inside the ASEAN bounds', () => {
  const inside = (lat: number, lon: number) =>
    lat >= ASEAN_BOUNDS.s - 1 && lat <= ASEAN_BOUNDS.n + 1 && lon >= ASEAN_BOUNDS.w - 1 && lon <= ASEAN_BOUNDS.e + 1;
  assert.ok(map.farms.every((f) => inside(f.lat, f.lon)));
  assert.ok(map.pois.every((p) => inside(p.lat, p.lon)));
});

test('Farm map: chunk buckets hold every farm exactly once', () => {
  const total = Object.values(map.byChunk).reduce((sum, b) => sum + b.farms.length, 0);
  assert.equal(total, map.farms.length);
  const farm = map.farms[0];
  assert.ok(map.byChunk[chunkKey(farm.lat, farm.lon)].farms.includes(farm));
});

test('Farm map: rice farms have water level, other crops do not', () => {
  assert.ok(map.farms.filter((f) => f.crop === 'rice').every((f) => f.water !== null));
  assert.ok(map.farms.filter((f) => f.crop !== 'rice').every((f) => f.water === null));
});

test('Farm map: field geometry closes its rings and stays within field count', () => {
  const farm = map.farms[3];
  const geometry = fieldsOf(farm);
  assert.equal(geometry.fields.length, farm.fieldsN);
  geometry.fields.forEach((field) => assert.deepEqual(field.ring[0], field.ring[field.ring.length - 1]));
  assert.deepEqual(geometry.bound[0], geometry.bound[geometry.bound.length - 1]);
});

test('Farm map: a chunk produces features for its farms and is empty when unknown', () => {
  const farm = map.farms[0];
  const key = chunkKey(farm.lat, farm.lon);
  const data = buildChunk(map, key, NOW);
  assert.equal(data.farms.length, map.byChunk[key].farms.length);
  assert.ok(data.fields.length >= data.farms.length);
  assert.ok(data.soil.length >= 1);
  assert.equal(buildChunk(map, '-90:-90', NOW).farms.length, 0);
});

test('Farm map: weather is stable within an hour and changes between hours', () => {
  const an = map.anchors[0];
  assert.deepEqual(weatherOf(an, NOW), weatherOf(an, NOW + 60000));
  const hours = new Set(Array.from({ length: 24 }, (_, h) => JSON.stringify(weatherOf(an, NOW + h * 3600000))));
  assert.ok(hours.size > 1);
  assert.equal(weatherOf(an, NOW).days.length, 3);
});

test('Farm map: wind converts from km/h to m/s', () => {
  const weather = weatherOf(map.anchors[0], NOW);
  assert.ok(Math.abs(windMs(weather) - weather.wind / 3.6) < 1e-9);
});

test('Farm map: local time applies the country offset', () => {
  assert.equal(localTime(6.5, 0, Date.UTC(2026, 9, 12, 0, 0)), '06:30 MMT');
  assert.equal(localTime(7, 30, Date.UTC(2026, 9, 12, 0, 0)), '06:30 ICT');
});

test('Farm map: search finds towns first, farms by code, and ignores empty input', () => {
  assert.deepEqual(searchFarmMap(map, '  '), []);
  const town = searchFarmMap(map, 'maubin');
  assert.equal(town[0].kind, 'place');
  assert.equal(town[0].title, 'Maubin');
  const code = searchFarmMap(map, map.farms[5].id.toLowerCase());
  assert.equal(code[0].kind, 'farm');
  assert.equal(code[0].id, map.farms[5].id);
  assert.ok(searchFarmMap(map, 'coffee').every((r) => r.kind !== 'coord'));
});

test('Farm map: coordinate queries parse and reject out of range values', () => {
  const ok = parseCoordinates('16.73, 95.65');
  assert.equal(ok?.[0].kind, 'coord');
  assert.equal(ok?.[0].lat, 16.73);
  assert.deepEqual(parseCoordinates('120, 10'), []);
  assert.equal(parseCoordinates('maubin'), null);
});

test('Farm map: nearest market belongs to the same anchor', () => {
  const farm = map.farms[0];
  const hit = nearestPoi(map, farm, 'market');
  assert.ok(hit);
  assert.equal(hit.poi.anchor, farm.anchor);
  assert.ok(hit.km >= 0);
});
