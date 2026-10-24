import assert from 'node:assert/strict';
import test from 'node:test';
import { getFarmMap } from '../../src/features/farm-simulation/lib/farmmap/farmMapData.ts';
import { fieldsOf } from '../../src/features/farm-simulation/lib/farmmap/farmMapGeometry.ts';
import { fromExample, fromOwn, inAsean } from '../../src/features/farm-simulation/lib/farmview/farmTarget.ts';
import { boxAround, clampCamera, decodeTerrarium, fogDensity, heightAt, ringPlan, slopeStats, type Heightfield } from '../../src/features/farm-simulation/lib/farmview/terrain.ts';
import { buildNeighbourhood, type OmtFeature } from '../../src/features/farm-simulation/lib/farmview/neighbourhood.ts';
import { buildProfile } from '../../src/features/farm-simulation/lib/farmview/profile.ts';
import { effectsFor, previewWeather, type WeatherNow } from '../../src/features/farm-simulation/lib/farmview/weatherFx.ts';
import { tilesFor } from '../../src/features/farm-simulation/lib/fieldsim/imagery.ts';
import type { ContractSpec } from '../../src/features/farm-simulation/lib/contractFarm.ts';

const flat = (lat: number, lon: number): [number, number] => [(lon - 95) * 111320 * Math.cos((lat * Math.PI) / 180), -(lat - 17) * 110574];
const SQUARE: [number, number][] = [[17, 95], [17, 95.01], [17.01, 95.01], [17.01, 95], [17, 95]];

test('an example farm is turned from [lon, lat] rings into [lat, lon] rings in the same place', () => {
  const farm = getFarmMap().farms[0];
  const target = fromExample(farm);
  const source = fieldsOf(farm).fields[0].ring[0];
  assert.deepEqual(target.fields[0].ring[0], [source[1], source[0]]);
  assert.ok(Math.abs(target.fields[0].ring[0][0] - farm.lat) < 0.2, 'first number is the latitude');
  assert.equal(target.kind, 'example');
  assert.equal(target.fields.length, farm.fieldsN);
  assert.ok(target.bbox.minLat < farm.lat && target.bbox.maxLat > farm.lat);
});

test('an own farm keeps its [lat, lon] boundary and ignores parcels without one', () => {
  const spec: ContractSpec = {
    farm: { id: 'f1', name: 'Test', country: 'MM', location: [17.005, 95.005], standard: null },
    parcels: [
      { id: 'p1', area_ha: 1, crop: 'Rice', boundary: SQUARE },
      { id: 'p2', area_ha: 2, boundary: null },
    ],
    assets: [],
  };
  const target = fromOwn('f1', spec, 'p1');
  assert.ok(target);
  assert.equal(target.kind, 'own');
  assert.equal(target.fields.length, 1);
  assert.deepEqual(target.fields[0].ring[0], [17, 95]);
  assert.equal(target.selectedId, 'p1');
});

test('an own farm with no boundary and no location has nothing to show', () => {
  const spec: ContractSpec = { farm: { id: 'f2', name: null, country: null, location: null, standard: null }, parcels: [], assets: [] };
  assert.equal(fromOwn('f2', spec), null);
});

test('only places inside the ASEAN box are covered', () => {
  assert.equal(inAsean({ lat: 17.1, lon: 95.2 }), true);
  assert.equal(inAsean({ lat: -8.37, lon: 115.13 }), true);
  assert.equal(inAsean({ lat: 48, lon: 2 }), false);
  assert.equal(inAsean({ lat: 17, lon: 140 }), false);
});

test('terrarium pixels decode to metres', () => {
  assert.equal(decodeTerrarium(128, 0, 0), 0);
  assert.equal(decodeTerrarium(128, 10, 0), 10);
  assert.equal(decodeTerrarium(127, 255, 128), -0.5);
  assert.equal(decodeTerrarium(128, 0, 128), 0.5);
  assert.equal(decodeTerrarium(127, 255, 0), -1);
});

test('the three rings widen from the farm to 3 km and 10 km and stay within their tile caps', () => {
  const centre = { lat: 17.0, lon: 95.0 };
  const rings = ringPlan({ minLat: 16.9995, maxLat: 17.0005, minLon: 94.9995, maxLon: 95.0005 }, centre);
  const km = (b: { minLat: number; maxLat: number }) => (b.maxLat - b.minLat) * 110.574;
  assert.ok(km(rings.farm) < 0.6 && km(rings.farm) > 0.25, `farm ring ${km(rings.farm)}`);
  assert.ok(Math.abs(km(rings.neighbourhood) - 3) < 0.05);
  assert.ok(Math.abs(km(rings.far) - 10) < 0.05);
  const near = tilesFor(rings.neighbourhood, 16);
  const far = tilesFor(rings.far, 9);
  assert.ok(near.tiles.length <= 16 && near.z >= 13 && near.z <= 16, `near z${near.z}`);
  assert.ok(far.tiles.length <= 9 && far.z >= 10 && far.z <= 14, `far z${far.z}`);
  assert.ok(near.z >= far.z);
});

test('a ring box is a square about the centre', () => {
  const b = boxAround(0, 100, 1.5);
  assert.ok(Math.abs(b.maxLat - b.minLat - 3 / 110.574) < 1e-6);
  assert.ok(Math.abs((b.maxLon - b.minLon) * 111.32 - 3) < 0.01);
});

function ramp(metresPerPixel: number): Heightfield {
  const size = 512;
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) data[y * size + x] = x * metresPerPixel;
  return { z: 14, x0: 12000, y0: 7000, cols: 2, rows: 2, data };
}

test('height is read between pixels by bilinear interpolation and is null outside the tiles', () => {
  const field = ramp(10);
  const lon = ((12000 + 0.5) / 2 ** 14) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (7000 + 0.5)) / 2 ** 14))) * 180) / Math.PI;
  const h = heightAt(field, lat, lon);
  assert.ok(h !== null && Math.abs(h - 1275) < 0.01, `height ${h}`);
  assert.equal(heightAt(field, 80, 0), null);
});

test('slope statistics follow the ground gradient', () => {
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (7000 + 1)) / 2 ** 14))) * 180) / Math.PI;
  const lon = ((12000 + 1) / 2 ** 14) * 360 - 180;
  const metresPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** 14;
  const steep = slopeStats(ramp(metresPerPixel), lat, lon, 1500);
  assert.ok(steep && Math.abs(steep.meanDeg - 45) < 1.5, `45 degrees expected, got ${steep?.meanDeg}`);
  const level = slopeStats(ramp(0), lat, lon, 1500);
  assert.ok(level && level.meanDeg < 0.01 && level.p90Deg < 0.01);
  assert.equal(slopeStats(ramp(1), 80, 0, 1500), null);
});

test('the camera cannot leave the neighbourhood, dive under the ground or fly out of the far ring', () => {
  const limits = { halfM: 1500, minAbove: 2, maxDistance: 900, groundAt: (x: number, z: number) => (x > 100 ? 40 : 10) + z * 0 };
  const out = clampCamera({ x: 5000, y: 3, z: 0 }, { x: 4000, y: 0, z: -4000 }, limits);
  assert.ok(Math.abs(out.target.x) <= 1500 && Math.abs(out.target.z) <= 1500);
  assert.ok(out.pos.y >= limits.groundAt(out.pos.x, out.pos.z) + 2);
  assert.ok(Math.hypot(out.pos.x - out.target.x, out.pos.y - out.target.y, out.pos.z - out.target.z) <= 900 + 1e-6);
  const fine = clampCamera({ x: 20, y: 60, z: 30 }, { x: 0, y: 12, z: 0 }, limits);
  assert.deepEqual(fine, { pos: { x: 20, y: 60, z: 30 }, target: { x: 0, y: 12, z: 0 } });
});

test('fog is 98 percent opaque at the edge of the far ring', () => {
  const d = fogDensity(5000);
  assert.ok(Math.abs(1 - Math.exp(-((5000 * d) ** 2)) - 0.98) < 1e-9);
});

const poly = (ring: [number, number][]) => ({ type: 'Polygon' as const, coordinates: [ring] });
const box = { minLat: 16.99, maxLat: 17.02, minLon: 94.99, maxLon: 95.02 };
const hut = (id: number, props: Record<string, unknown> = {}): OmtFeature => ({
  layer: 'building',
  cls: null,
  id,
  name: null,
  props,
  geometry: poly([[95.001, 17.001], [95.0012, 17.001], [95.0012, 17.0012], [95.001, 17.0012], [95.001, 17.001]]),
});

test('buildings take the mapped height when there is one and are always marked illustrative', () => {
  const out = buildNeighbourhood([hut(1, { render_height: 7, render_min_height: 2 }), hut(2)], flat, 'seed', box);
  assert.equal(out.buildings.length, 2);
  const [tall, plain] = out.buildings;
  assert.equal(tall.heightM, 7);
  assert.equal(tall.minHeightM, 2);
  assert.equal(tall.heightSource, 'osm');
  assert.equal(plain.heightSource, 'default');
  assert.ok(out.buildings.every((b) => b.illustrative));
});

test('the same feature from two neighbouring tiles is drawn once', () => {
  assert.equal(buildNeighbourhood([hut(5), hut(5)], flat, 'seed', box).buildings.length, 1);
  assert.equal(buildNeighbourhood([hut(0), hut(0)], flat, 'seed', box).buildings.length, 1);
});

test('features wholly outside the box are dropped', () => {
  const far: OmtFeature = { ...hut(9), geometry: poly([[96, 18], [96.001, 18], [96.001, 18.001], [96, 18.001], [96, 18]]) };
  assert.equal(buildNeighbourhood([far], flat, 'seed', box).buildings.length, 0);
});

test('a road becomes a ribbon with a width for its class and points no more than 10 m apart', () => {
  const road: OmtFeature = { layer: 'transportation', cls: 'primary', id: 3, name: null, props: {}, geometry: { type: 'LineString', coordinates: [[95.0, 17.0], [95.01, 17.0]] } };
  const track: OmtFeature = { ...road, id: 4, cls: 'track' };
  const out = buildNeighbourhood([road, track], flat, 'seed', box);
  assert.equal(out.roads.length, 2);
  const primary = out.roads.find((r) => r.cls === 'primary')!;
  assert.ok(primary.widthM > out.roads.find((r) => r.cls === 'track')!.widthM);
  assert.ok(primary.illustrative);
  for (let i = 1; i < primary.points.length; i += 1) {
    const [x0, z0] = primary.points[i - 1];
    const [x1, z1] = primary.points[i];
    assert.ok(Math.hypot(x1 - x0, z1 - z0) <= 10.0001);
  }
});

test('a wood becomes trees inside it, in about the same number every time', () => {
  const wood: OmtFeature = { layer: 'landcover', cls: 'wood', id: 8, name: null, props: {}, geometry: poly([[95.0, 17.0], [95.004, 17.0], [95.004, 17.004], [95.0, 17.004], [95.0, 17.0]]) };
  const a = buildNeighbourhood([wood], flat, 'seed', box);
  const b = buildNeighbourhood([wood], flat, 'seed', box);
  assert.deepEqual(a.trees, b.trees);
  const area = 0.004 * 111320 * Math.cos((17 * Math.PI) / 180) * 0.004 * 110574;
  assert.ok(a.trees.length > (area / 144) * 0.6 && a.trees.length < (area / 144) * 1.4, `trees ${a.trees.length}`);
  const [minX, , ] = flat(17, 95);
  assert.ok(a.trees.every((t) => t.x >= minX - 1));
});

test('tree count is capped so a large forest cannot stall the page', () => {
  const wood: OmtFeature = { layer: 'landcover', cls: 'forest', id: 11, name: null, props: {}, geometry: poly([[94.99, 16.99], [95.02, 16.99], [95.02, 17.02], [94.99, 17.02], [94.99, 16.99]]) };
  assert.ok(buildNeighbourhood([wood], flat, 'seed', box, { maxTrees: 500 }).trees.length <= 500);
});

test('rock, wetland, water and volcano features land in their own lists', () => {
  const at = (layer: string, cls: string, id: number): OmtFeature => ({ layer, cls, id, name: null, props: {}, geometry: poly([[95.0, 17.0], [95.002, 17.0], [95.002, 17.002], [95.0, 17.002], [95.0, 17.0]]) });
  const peak: OmtFeature = { layer: 'mountain_peak', cls: 'volcano', id: 20, name: 'Test Peak', props: { ele: 1717 }, geometry: { type: 'Point', coordinates: [95.01, 17.01] } };
  const out = buildNeighbourhood([at('landcover', 'rock', 12), at('landcover', 'wetland', 13), at('water', 'lake', 14), peak], flat, 'seed', box);
  assert.ok(out.rocks.length > 0);
  assert.ok(out.reeds.length > 0);
  assert.equal(out.water.length, 1);
  assert.deepEqual(out.volcano, { name: 'Test Peak', eleM: 1717 });
});

test('a profile reports measured facts with their source and says when a number is unknown', () => {
  const none = { river: null, canal: null, coast: null, lake: null, forest: null, wetland: null, peak: null };
  const profile = buildProfile({ elevationM: null, slope: { meanDeg: 4, p90Deg: 9 }, nearest: { ...none, river: { km: 0.4, name: 'Pegu', ele: null } }, volcano: null, volcanoPeak: false });
  const slope = profile.chips.find((c) => c.key === 'slope')!;
  assert.equal(slope.value, 9);
  assert.match(slope.source, /DEM/);
  const elevation = profile.chips.find((c) => c.key === 'elevation')!;
  assert.equal(elevation.value, null);
  assert.ok(elevation.reason);
  assert.equal(profile.chips.find((c) => c.key === 'river')!.value, 0.4);
  assert.equal(profile.volcanic, false);
});

test('slope, height and a volcano choose the terrain class and the asset sets', () => {
  const none = { river: null, canal: null, coast: null, lake: null, forest: null, wetland: null, peak: null };
  const base = { nearest: none, volcano: null, volcanoPeak: false };
  assert.equal(buildProfile({ ...base, elevationM: 5, slope: { meanDeg: 0.2, p90Deg: 0.6 } }).terrain, 'flat');
  assert.equal(buildProfile({ ...base, elevationM: 900, slope: { meanDeg: 12, p90Deg: 22 } }).terrain, 'mountainous');
  assert.equal(buildProfile({ ...base, elevationM: 1400, slope: { meanDeg: 12, p90Deg: 22 } }).treeSet, 'montane');
  assert.equal(buildProfile({ ...base, elevationM: 20, slope: null }).treeSet, 'lowland');
  const volcanic = buildProfile({ ...base, elevationM: 700, slope: null, volcano: { km: 6, name: 'Test' } });
  assert.equal(volcanic.volcanic, true);
  assert.equal(volcanic.rockSet, 'volcanic');
  assert.equal(buildProfile({ ...base, elevationM: 700, slope: null, volcano: { km: 90, name: 'Far' } }).volcanic, false);
});

const wx = (over: Partial<WeatherNow>): WeatherNow => ({
  weather_code: 0, precipitation: 0, rain: 0, cloud_cover: 10, wind_speed_10m: 1, wind_direction_10m: 90, wind_gusts_10m: 2, is_day: 1, visibility: 20000, temperature_2m: 30, relative_humidity_2m: 60, ...over,
});

test('weather codes and rain rates choose the precipitation effect', () => {
  assert.equal(effectsFor(wx({ weather_code: 0 }), false).precip, 'none');
  assert.equal(effectsFor(wx({ weather_code: 53, rain: 0.3 }), false).precip, 'drizzle');
  assert.equal(effectsFor(wx({ weather_code: 61, rain: 1.2 }), false).precip, 'rain');
  assert.equal(effectsFor(wx({ weather_code: 63, rain: 9 }), false).precip, 'heavy');
  const storm = effectsFor(wx({ weather_code: 95, rain: 4 }), false);
  assert.equal(storm.precip, 'storm');
  assert.equal(storm.lightning, true);
  assert.equal(effectsFor(wx({ weather_code: 1, rain: 3 }), false).precip, 'rain');
});

test('fog and mist follow the code and the visibility', () => {
  assert.equal(effectsFor(wx({ weather_code: 45 }), false).fog, 'fog');
  assert.equal(effectsFor(wx({ visibility: 800 }), false).fog, 'fog');
  assert.equal(effectsFor(wx({ visibility: 3000 }), false).fog, 'mist');
  assert.equal(effectsFor(wx({ visibility: 12000 }), false).fog, 'none');
  assert.equal(effectsFor(wx({ visibility: null }), false).fog, 'none');
});

test('wind sets the sway on the Beaufort scale and the clouds drift downwind', () => {
  const calm = effectsFor(wx({ wind_speed_10m: 0.2 }), false);
  const gale = effectsFor(wx({ wind_speed_10m: 18, wind_direction_10m: 270 }), false);
  assert.equal(calm.beaufort, 0);
  assert.equal(gale.beaufort, 8);
  assert.ok(gale.swayAmp > calm.swayAmp && gale.swayAmp <= 1);
  assert.equal(gale.driftDeg, 90);
  assert.equal(effectsFor(wx({ wind_speed_10m: null }), false).beaufort, null);
});

test('night comes from the provider flag, and unknown stays unknown', () => {
  assert.equal(effectsFor(wx({ is_day: 0 }), false).night, true);
  assert.equal(effectsFor(wx({ is_day: 1 }), false).night, false);
  assert.equal(effectsFor(wx({ is_day: null }), false).night, null);
});

test('no reading gives no effects and says why', () => {
  const none = effectsFor(null, false);
  assert.equal(none.precip, 'none');
  assert.equal(none.available, false);
  assert.ok(none.reasons.length > 0);
});

test('reduced motion keeps the picture but stops the movement', () => {
  assert.equal(effectsFor(wx({ weather_code: 63, rain: 9 }), true).animate, false);
  assert.equal(effectsFor(wx({ weather_code: 63, rain: 9 }), false).animate, true);
});

test('preview weather is always marked as a preview', () => {
  for (const kind of ['clear', 'rain', 'storm', 'fog', 'night'] as const) assert.equal(previewWeather(kind, false).preview, true);
  assert.equal(previewWeather('storm', false).lightning, true);
  assert.equal(previewWeather('night', false).night, true);
  assert.equal(effectsFor(wx({}), false).preview, false);
});
