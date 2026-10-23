import { tr } from '../i18n.ts';

export type NearKind = 'river' | 'canal' | 'coast' | 'lake' | 'forest' | 'wetland' | 'peak';

type Coord = number[];

export type NearGeometry =
  | { type: 'Point'; coordinates: Coord }
  | { type: 'MultiPoint' | 'LineString'; coordinates: Coord[] }
  | { type: 'MultiLineString' | 'Polygon'; coordinates: Coord[][] }
  | { type: 'MultiPolygon'; coordinates: Coord[][][] };

export interface NearFeature {
  layer: string;
  cls: string;
  name: string | null;
  ele: number | null;
  geometry: NearGeometry;
}

export interface NearHit {
  km: number;
  name: string | null;
  ele: number | null;
}

export type Nearest = Record<NearKind, NearHit | null>;

export interface Favor {
  kind: NearKind | 'elevation';
  tone: 'good' | 'watch' | 'info';
  text: string;
}

export const NEAR_KINDS: readonly NearKind[] = ['river', 'canal', 'coast', 'lake', 'forest', 'wetland', 'peak'];

export const SCREENING = {
  coastKm: 15,
  riverKm: 2,
  floodElevationM: 10,
  canalKm: 1,
  lakeKm: 3,
  forestKm: 2,
  wetlandKm: 2,
  reliefM: 300,
  lowlandM: 5,
  highlandM: 1000,
} as const;

const KM_PER_DEG = 111.32;

export function kindOf(layer: string, cls: string): NearKind | null {
  if (layer === 'waterway') return cls === 'river' || cls === 'stream' ? 'river' : ['canal', 'drain', 'ditch'].includes(cls) ? 'canal' : null;
  if (layer === 'water') return cls === 'ocean' ? 'coast' : cls === 'river' ? 'river' : ['lake', 'pond'].includes(cls) ? 'lake' : null;
  if (layer === 'landcover') return cls === 'wood' || cls === 'forest' ? 'forest' : cls === 'wetland' ? 'wetland' : null;
  if (layer === 'mountain_peak') return cls === 'peak' || cls === 'volcano' ? 'peak' : null;
  return null;
}

function segmentKm(px: number, py: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function inside(ring: [number, number][], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function distanceKm(lat: number, lon: number, geometry: NearGeometry): number {
  const kx = KM_PER_DEG * Math.cos((lat * Math.PI) / 180);
  const local = (c: Coord): [number, number] => [(c[0] - lon) * kx, (c[1] - lat) * KM_PER_DEG];
  const line = (coords: Coord[]): number => {
    const pts = coords.map(local);
    if (pts.length === 1) return Math.hypot(pts[0][0], pts[0][1]);
    let best = Infinity;
    for (let i = 1; i < pts.length; i += 1) best = Math.min(best, segmentKm(0, 0, pts[i - 1], pts[i]));
    return best;
  };
  const polygon = (rings: Coord[][]): number => {
    const [outer, ...holes] = rings.map((r) => r.map(local));
    if (outer && inside(outer, 0, 0) && !holes.some((h) => inside(h, 0, 0))) return 0;
    return Math.min(...rings.map(line));
  };
  switch (geometry.type) {
    case 'Point':
      return line([geometry.coordinates]);
    case 'MultiPoint':
      return Math.min(...geometry.coordinates.map((c) => line([c])));
    case 'LineString':
      return line(geometry.coordinates);
    case 'MultiLineString':
      return Math.min(...geometry.coordinates.map(line));
    case 'Polygon':
      return polygon(geometry.coordinates);
    case 'MultiPolygon':
      return Math.min(...geometry.coordinates.map(polygon));
  }
}

export function nearest(lat: number, lon: number, features: readonly NearFeature[], radiusKm: number): Nearest {
  const out: Nearest = { river: null, canal: null, coast: null, lake: null, forest: null, wetland: null, peak: null };
  for (const f of features) {
    const kind = kindOf(f.layer, f.cls);
    if (!kind) continue;
    const km = distanceKm(lat, lon, f.geometry);
    if (!Number.isFinite(km) || km > radiusKm) continue;
    const best = out[kind];
    if (kind === 'peak') {
      if (f.ele !== null && (!best || (best.ele ?? -Infinity) < f.ele)) out.peak = { km, name: f.name, ele: f.ele };
      continue;
    }
    if (!best || km < best.km || (km === best.km && !best.name && f.name)) out[kind] = { km, name: f.name ?? best?.name ?? null, ele: null };
  }
  return out;
}

export function mergeNearest(a: Nearest, b: Nearest): Nearest {
  const out = { ...a };
  for (const kind of NEAR_KINDS) {
    const x = a[kind];
    const y = b[kind];
    if (!y) continue;
    if (!x) out[kind] = y;
    else if (kind === 'peak') out[kind] = (y.ele ?? -Infinity) > (x.ele ?? -Infinity) ? y : x;
    else out[kind] = y.km < x.km ? { ...y, name: y.name ?? x.name } : x;
  }
  return out;
}

const within = (hit: NearHit | null, km: number): hit is NearHit => hit !== null && hit.km <= km;

export function favors(near: Nearest, elevationM: number | null): Favor[] {
  const out: Favor[] = [];
  if (within(near.coast, SCREENING.coastKm)) {
    out.push({ kind: 'coast', tone: 'watch', text: tr('farmMap.favor.salinity') });
    out.push({ kind: 'coast', tone: 'info', text: tr('farmMap.favor.shrimp') });
  }
  if (within(near.river, SCREENING.riverKm)) {
    out.push({ kind: 'river', tone: 'good', text: tr('farmMap.favor.river') });
    if (elevationM !== null && elevationM <= SCREENING.floodElevationM) {
      out.push({ kind: 'river', tone: 'watch', text: tr('farmMap.favor.lowRiver') });
    }
  }
  if (within(near.canal, SCREENING.canalKm)) out.push({ kind: 'canal', tone: 'good', text: tr('farmMap.favor.canal') });
  if (within(near.lake, SCREENING.lakeKm)) out.push({ kind: 'lake', tone: 'good', text: tr('farmMap.favor.lake') });
  if (within(near.forest, SCREENING.forestKm)) {
    out.push({ kind: 'forest', tone: 'watch', text: tr('farmMap.favor.forest') });
  }
  if (within(near.wetland, SCREENING.wetlandKm)) out.push({ kind: 'wetland', tone: 'info', text: tr('farmMap.favor.wetland') });
  if (near.peak?.ele != null && elevationM !== null && near.peak.ele - elevationM >= SCREENING.reliefM) {
    out.push({ kind: 'peak', tone: 'info', text: tr('farmMap.favor.hills') });
  }
  if (elevationM !== null && elevationM <= SCREENING.lowlandM) out.push({ kind: 'elevation', tone: 'watch', text: tr('farmMap.favor.lowland') });
  if (elevationM !== null && elevationM >= SCREENING.highlandM) {
    out.push({ kind: 'elevation', tone: 'info', text: tr('farmMap.favor.highland') });
  }
  return out;
}
