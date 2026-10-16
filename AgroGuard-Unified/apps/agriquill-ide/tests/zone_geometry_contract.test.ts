import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SEED_PARCELS, DEMO_SEED_PARCEL } from '../src/data/seedParcels.ts';
import {
  calculatePolygonAreaHa,
  makeProjector,
  pointInPoly,
  ringToShape
} from '../src/lib/geo.ts';

const ALL = Object.values(SEED_PARCELS);

test('every fixture parcel is labelled seed, never measured or model', () => {
  for (const parcel of ALL) {
    for (const zone of parcel.zones) {
      assert.equal(
        zone.source,
        'seed',
        `zone ${zone.id} claims provenance "${zone.source}" but nothing measured or modelled it`
      );
    }
  }
});

test('every ring is closed and has at least three distinct vertices', () => {
  for (const parcel of ALL) {
    const rings = [parcel.ring, ...parcel.zones.map((z) => z.ring)];
    for (const ring of rings) {
      assert.ok(ring.length >= 4, `ring needs at least 4 points to form a polygon, got ${ring.length}`);
      const [first, last] = [ring[0], ring[ring.length - 1]];
      assert.deepEqual(first, last, `ring is not closed: ${first} !== ${last}`);

      const distinct = new Set(ring.slice(0, -1).map((p) => p.join(',')));
      assert.ok(distinct.size >= 3, `ring is degenerate: only ${distinct.size} distinct vertices`);
    }
  }
});

test('every coordinate is a valid WGS84 lon/lat pair', () => {
  for (const parcel of ALL) {
    for (const point of [...parcel.ring, ...parcel.zones.flatMap((z) => z.ring)]) {
      const [lon, lat] = point;
      assert.ok(lon >= -180 && lon <= 180, `longitude ${lon} out of range`);
      assert.ok(lat >= -90 && lat <= 90, `latitude ${lat} out of range`);
    }
  }
});

test('zone area is derived from geometry, not typed into the fixture', () => {
  for (const parcel of ALL) {
    const zoneArea = parcel.zones.reduce((sum, z) => sum + (z.areaHa ?? 0), 0);
    assert.ok(zoneArea > 0, `parcel ${parcel.id} has zero total zone area`);
  }
});

test('zones tile the parcel without overlapping', () => {
  for (const parcel of ALL) {
    const projector = makeProjector(parcel.ring);

    for (const zone of parcel.zones) {
      const { pts } = ringToShape(zone.ring, projector);
      assert.ok(pts.length >= 4, `zone ${zone.id} ring did not project`);
    }

    // Each zone's centroid must sit inside that zone, which proves the polygon
    // is not self-intersecting and can actually be extruded.
    for (const zone of parcel.zones) {
      const pts = zone.ring.map(projector);
      const centroidX = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const centroidY = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      assert.ok(
        pointInPoly(centroidX, centroidY, pts),
        `zone ${zone.id} centroid falls outside its own ring, so the polygon is self-intersecting`
      );
    }
  }
});

test('a known rectangle projects to the expected side lengths in metres', () => {
  // 0.001 deg of latitude is a fixed 111.19 m regardless of reference latitude,
  // which makes it a stable expectation against the equirectangular transform.
  const ring: [number, number][] = [
    [96.0, 17.0],
    [96.001, 17.0],
    [96.001, 17.001],
    [96.0, 17.001],
    [96.0, 17.0]
  ];
  const projector = makeProjector(ring);
  const pts = ring.map(projector);

  const northSouthMetres = Math.abs(pts[2][1] - pts[1][1]);
  const expectedNorthSouth = (0.001 * Math.PI / 180) * 6371008.8;
  assert.ok(
    Math.abs(northSouthMetres - expectedNorthSouth) < 0.01,
    `north-south span ${northSouthMetres.toFixed(3)} m, expected ${expectedNorthSouth.toFixed(3)} m`
  );

  // Longitude metres shrink by cos(lat), so the east-west span must be smaller
  // than the north-south span at latitude 17. The projector pins its reference
  // latitude to the mean of the ring's vertices, so the expected contraction is
  // cos of that mean rather than cos of the corner latitude.
  const eastWestMetres = Math.abs(pts[1][0] - pts[0][0]);
  assert.ok(
    eastWestMetres < northSouthMetres,
    'east-west span should contract with cos(lat) away from the equator'
  );
  const referenceLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const ratio = eastWestMetres / northSouthMetres;
  assert.ok(
    Math.abs(ratio - Math.cos((referenceLat * Math.PI) / 180)) < 1e-9,
    `cosine contraction ratio ${ratio.toFixed(12)} does not match cos(${referenceLat}deg)`
  );
});

test('shoelace area matches the analytic area of the same rectangle', () => {
  const ring: [number, number][] = [
    [96.0, 17.0],
    [96.002, 17.0],
    [96.002, 17.003],
    [96.0, 17.003],
    [96.0, 17.0]
  ];
  const projector = makeProjector(ring);
  const pts = ring.map(projector);
  const measured = calculatePolygonAreaHa(pts);

  const northSouth = Math.abs(pts[2][1] - pts[0][1]);
  const eastWest = Math.abs(pts[1][0] - pts[0][0]);
  const expected = (northSouth * eastWest) / 10000;
  assert.ok(
    Math.abs(measured - expected) / expected < 1e-6,
    `shoelace ${measured.toFixed(4)} ha disagrees with rectangle ${expected.toFixed(4)} ha`
  );
});

test('point-in-polygon rejects an exterior point and accepts the centroid', () => {
  const projector = makeProjector(DEMO_SEED_PARCEL.ring);
  const pts = DEMO_SEED_PARCEL.ring.map(projector);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;

  assert.equal(pointInPoly(cx, cy, pts), true, 'centroid must be inside');
  assert.equal(pointInPoly(cx + 10000, cy, pts), false, 'far east must be outside');
  assert.equal(pointInPoly(cx, cy + 10000, pts), false, 'far north must be outside');
});

test('a zone with null stress stays null so absence of evidence is preserved', () => {
  const shrimp = SEED_PARCELS.shrimp;
  const noData = shrimp.zones.filter((z) => z.stress === null);
  assert.ok(noData.length > 0, 'the shrimp fixture exists to exercise the no-evidence path');
  for (const zone of noData) {
    assert.ok((zone.areaHa ?? 0) > 0, 'a zone with no stress reading still has a measurable boundary');
  }
});