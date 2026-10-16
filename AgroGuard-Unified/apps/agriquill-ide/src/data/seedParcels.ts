import type { Parcel, Zone } from '../types.ts';
import { calculatePolygonAreaHa } from '../lib/geo.ts';

/**
 * DEMO fixtures for the 3D field view.
 *
 * Three rules govern everything in this module:
 *
 * 1. Every boundary here is a hand-drawn rectangle, not a surveyed boundary.
 *    Nothing in AgriQill has measured these coordinates.
 * 2. `source` is `'seed'` for all of them. The previous revision of this file
 *    labelled two parcels `'measured'` and one `'model'`, which claimed a
 *    measurement and a model run that do not exist.
 * 3. `areaHa` is derived from the ring by `calculatePolygonAreaHa`, so the
 *    reported area is a consequence of the geometry rather than a number typed
 *    into a label. That also keeps the value honest if a ring is ever edited.
 *
 * Zone stress here is a starting condition for the demo scenario, not an
 * observation. It is surfaced in the UI as SIMULATED (fixture), never measured.
 */

type ZoneSeed = Omit<Zone, 'source' | 'areaHa'>;

function zone(seed: ZoneSeed): Zone {
  return { ...seed, source: 'seed', areaHa: calculatePolygonAreaHa(toLocal(seed.ring)) };
}

/**
 * Project a geographic ring into the parcel's own local metre frame so area is
 * measured against the same projection the scene renders with.
 */
function toLocal(ring: [number, number][]): [number, number][] {
  const lon0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const k = Math.PI / 180;
  const R = 6371008.8;
  return ring.map(([lon, lat]) => [
    (lon - lon0) * k * R * Math.cos(lat0 * k),
    (lat - lat0) * k * R
  ]);
}

/**
 * Baseline demo parcel, Bago Region. Two zones split the block west to east.
 */
const DEMO_ZONES: Zone[] = [
  zone({
    id: 'z1',
    name: 'Zone A - Jasmine Paddy',
    crop: 'rice',
    variety: 'Paw San Hmwe',
    stress: 0.18,
    ring: [
      [96.0, 17.0],
      [96.002, 17.0],
      [96.002, 17.003],
      [96.0, 17.003],
      [96.0, 17.0]
    ]
  }),
  zone({
    id: 'z2',
    name: 'Zone B - AWD Water-Saving',
    crop: 'rice',
    variety: 'Sin Thwel Latt',
    stress: 0.42,
    ring: [
      [96.002, 17.0],
      [96.004, 17.0],
      [96.004, 17.003],
      [96.002, 17.003],
      [96.002, 17.0]
    ]
  })
];

export const DEMO_SEED_PARCEL: Parcel = {
  id: 'p1',
  name: 'Demo parcel (seed)',
  region: 'Bago Basin',
  country: 'Myanmar',
  centroid: { lat: 17.0015, lon: 96.002 },
  ring: [
    [96.0, 17.0],
    [96.004, 17.0],
    [96.004, 17.003],
    [96.0, 17.003],
    [96.0, 17.0]
  ],
  zones: DEMO_ZONES
};

/**
 * Flagship demo parcel, Ayeyarwady Delta. The centroid matches
 * `REAL_WORLD_EARTH_PARCELS[0]` so the 3D view and the existing soil/weather
 * inspector refer to the same location. The boundary itself is still a fixture.
 */
const DELTA_ZONES: Zone[] = [
  zone({
    id: 'delta-z1',
    name: 'Polder 1 - Organic Jasmine',
    crop: 'rice',
    variety: 'Paw San Yin (ASOA Organic)',
    stress: 0.12,
    ring: [
      [95.878, 16.98],
      [95.881, 16.98],
      [95.881, 16.985],
      [95.878, 16.985],
      [95.878, 16.98]
    ]
  }),
  zone({
    id: 'delta-z2',
    name: 'Polder 2 - Controlled Flood Basin',
    crop: 'rice',
    variety: 'Ayeyar Min',
    stress: 0.38,
    ring: [
      [95.881, 16.98],
      [95.884, 16.98],
      [95.884, 16.985],
      [95.881, 16.985],
      [95.881, 16.98]
    ]
  })
];

export const AYEYARWADY_DELTA_PARCEL: Parcel = {
  id: 'delta-01',
  name: 'Ayeyarwady Delta Enterprise',
  region: 'Ayeyarwady Delta',
  country: 'Myanmar',
  centroid: { lat: 16.9825, lon: 95.8812 },
  ring: [
    [95.878, 16.98],
    [95.884, 16.98],
    [95.884, 16.985],
    [95.878, 16.985],
    [95.878, 16.98]
  ],
  zones: DELTA_ZONES
};

/**
 * Coastal polyculture demo parcel, Mon State. `mon-z2` has `stress: null`,
 * which means no evidence exists for that zone. The inspector must render that
 * as INSUFFICIENT_EVIDENCE rather than substituting a number.
 */
const MON_ZONES: Zone[] = [
  zone({
    id: 'mon-z1',
    name: 'Saline-Tolerant Rice Basin',
    crop: 'rice',
    variety: 'BRRI dhan47',
    stress: 0.22,
    ring: [
      [97.635, 16.488],
      [97.6385, 16.488],
      [97.6385, 16.493],
      [97.635, 16.493],
      [97.635, 16.488]
    ]
  }),
  zone({
    id: 'mon-z2',
    name: 'Brackish Aquaculture Polder',
    crop: 'aquaculture',
    variety: 'Black Tiger Shrimp',
    stress: null,
    ring: [
      [97.6385, 16.488],
      [97.642, 16.488],
      [97.642, 16.493],
      [97.6385, 16.493],
      [97.6385, 16.488]
    ]
  })
];

export const MAWLAMYINE_SHRIMP_PARCEL: Parcel = {
  id: 'mon-01',
  name: 'Mawlamyine Rice-Shrimp Polder',
  region: 'Mon Coastal Plain',
  country: 'Myanmar',
  centroid: { lat: 16.4905, lon: 97.6385 },
  ring: [
    [97.635, 16.488],
    [97.642, 16.488],
    [97.642, 16.493],
    [97.635, 16.493],
    [97.635, 16.488]
  ],
  zones: MON_ZONES
};

export const SEED_PARCELS: Record<string, Parcel> = {
  demo: DEMO_SEED_PARCEL,
  delta: AYEYARWADY_DELTA_PARCEL,
  shrimp: MAWLAMYINE_SHRIMP_PARCEL
};