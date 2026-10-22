import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';

export type Corner = [lat: number, lon: number];

export const MIN_CORNERS = 3;
export const TRACE_MIN_ZOOM = 14;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON_EQUATOR = 111320;

export function tracedRing(corners: Corner[]): Corner[] {
  if (!corners.length) return [];
  const [first] = corners;
  const last = corners[corners.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? [...corners] : [...corners, first];
}

export function ringAreaHa(ring: Corner[]): number {
  if (ring.length < MIN_CORNERS + 1) return 0;
  const lat0 = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
  const kx = M_PER_DEG_LON_EQUATOR * Math.cos((lat0 * Math.PI) / 180);
  const xs = ring.map((p) => (p[1] - ring[0][1]) * kx);
  const ys = ring.map((p) => (p[0] - ring[0][0]) * M_PER_DEG_LAT);
  let twice = 0;
  for (let i = 0; i < ring.length - 1; i += 1) twice += xs[i] * ys[i + 1] - xs[i + 1] * ys[i];
  return Math.round((Math.abs(twice) / 2 / 10000) * 1000) / 1000;
}

const lonLat = (ring: Corner[]) => ring.map(([lat, lon]) => [lon, lat]);

export function tracedGeojson(corners: Corner[], field: string): string | null {
  const open = tracedRing(corners).slice(0, -1);
  if (open.length < MIN_CORNERS) return null;
  const doc: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { field, source: 'traced on the farm map' },
        geometry: { type: 'Polygon', coordinates: [lonLat(tracedRing(corners))] },
      },
    ],
  };
  return JSON.stringify(doc);
}

export function traceFeatures(corners: Corner[]): FeatureCollection<Point | Polygon> {
  const points: Feature<Point>[] = corners.map(([lat, lon], i) => ({
    type: 'Feature',
    properties: { n: i + 1 },
    geometry: { type: 'Point', coordinates: [lon, lat] },
  }));
  const outline: Feature<Polygon>[] =
    corners.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [lonLat(tracedRing(corners))] } }] : [];
  return { type: 'FeatureCollection', features: [...outline, ...points] };
}
