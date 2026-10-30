import { test } from 'node:test';
import assert from 'node:assert/strict';
import outlines from '../../src/features/farm-simulation/data/demoFields/outlines.json' with { type: 'json' };
import { getFarmMap } from '../../src/features/farm-simulation/lib/farmmap/farmMapData.ts';
import { fieldsOf } from '../../src/features/farm-simulation/lib/farmmap/farmMapGeometry.ts';
import { SMALL_MEDIUM_MAX_HA } from '../../src/features/farm-simulation/lib/farmmap/farmSize.ts';
import { isSimpleRing, ringAreaHa, type Corner } from '../../src/features/farm-simulation/lib/farmmap/trace.ts';
import { fromExample } from '../../src/features/farm-simulation/lib/farmview/farmTarget.ts';

type Saved = { osm: string; landuse: string; ring: Corner[]; areaHa: number };
const saved = outlines as unknown as Record<string, Saved[]>;
const map = getFarmMap();
const placed = map.farms.filter((f) => f.osm);

test('Demo fields: isSimpleRing accepts a square and rejects a bow tie', () => {
  assert.equal(isSimpleRing([[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]), true);
  assert.equal(isSimpleRing([[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]]), false);
});

test('Demo fields: every saved outline is a simple ring of 0.2 to 10 ha with its OSM id', () => {
  const all = Object.values(saved).flat();
  assert.ok(all.length > 0);
  for (const o of all) {
    assert.match(o.osm, /^way\/\d+$/);
    assert.ok(o.areaHa >= 0.2 && o.areaHa <= SMALL_MEDIUM_MAX_HA, `${o.osm} ${o.areaHa} ha`);
    assert.ok(Math.abs(ringAreaHa([...o.ring, o.ring[0]]) - o.areaHa) <= 0.01);
    assert.ok(isSimpleRing([...o.ring, o.ring[0]]), `${o.osm} crosses itself`);
  }
});

test('Demo fields: the first farms of an anchor sit on its saved outlines, the rest keep the generated grid', () => {
  assert.ok(placed.length > 0);
  for (const anchor of map.anchors) {
    const list = saved[anchor.id] ?? [];
    anchor.farms.forEach((farm, i) => {
      assert.equal(farm.osm?.id, list[i]?.osm, `${farm.id} outline`);
    });
  }
});

test('Demo fields: a placed farm is one field with the real ring, its area, and a bound around it', () => {
  assert.ok(placed.length > 0);
  for (const farm of placed) {
    const osm = farm.osm!;
    const { fields, bound } = fieldsOf(farm);
    assert.equal(fields.length, 1);
    assert.equal(farm.fieldsN, 1);
    assert.deepEqual(fields[0].ring, osm.ring);
    assert.deepEqual(osm.ring[0], osm.ring[osm.ring.length - 1]);
    assert.ok(farm.area <= SMALL_MEDIUM_MAX_HA);
    assert.ok(Math.abs(farm.area - osm.areaHa) <= 0.05 + 1e-9);
    const lons = osm.ring.map((p) => p[0]);
    const lats = osm.ring.map((p) => p[1]);
    assert.ok(farm.lon >= Math.min(...lons) && farm.lon <= Math.max(...lons));
    assert.ok(farm.lat >= Math.min(...lats) && farm.lat <= Math.max(...lats));
    assert.ok(Math.min(...bound.map((p) => p[0])) < Math.min(...lons));
    assert.ok(Math.max(...bound.map((p) => p[1])) > Math.max(...lats));
  }
});

test('Demo fields: the 3D target names the OSM way for placed farms and nothing for illustrative ones', () => {
  const real = placed[0];
  const grid = map.farms.find((f) => !f.osm)!;
  assert.equal(fromExample(real).outline, real.osm!.id);
  assert.equal(fromExample(grid).outline, null);
});
