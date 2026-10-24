import type { ContractSpec } from '../contractFarm.ts';
import { fieldsOf } from '../farmmap/farmMapGeometry.ts';
import { ASEAN_BOUNDS } from '../farmmap/farmMapRegions.ts';
import type { Farm } from '../farmmap/farmMapTypes.ts';
import type { BBox } from '../fieldsim/imagery.ts';

export type LatLon = readonly [number, number];

export interface TargetField {
  id: string;
  ring: LatLon[];
  crop: string | null;
  stage: string | null;
}

export interface FarmTarget {
  kind: 'example' | 'own';
  id: string;
  label: string;
  fields: TargetField[];
  centre: { lat: number; lon: number };
  bbox: BBox;
  selectedId: string | null;
}

const MIN_HALF_DEG = 0.0005;

function bboxOf(points: readonly LatLon[], centre: { lat: number; lon: number }): BBox {
  if (!points.length) {
    return { minLat: centre.lat - MIN_HALF_DEG, maxLat: centre.lat + MIN_HALF_DEG, minLon: centre.lon - MIN_HALF_DEG, maxLon: centre.lon + MIN_HALF_DEG };
  }
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
}

export function fromExample(farm: Farm, fieldId: string | null = null): FarmTarget {
  const fields: TargetField[] = fieldsOf(farm).fields.map((f) => ({
    id: f.id,
    ring: f.ring.map(([lon, lat]): LatLon => [lat, lon]),
    crop: f.crop,
    stage: f.stage,
  }));
  const centre = { lat: farm.lat, lon: farm.lon };
  return { kind: 'example', id: farm.id, label: farm.name, fields, centre, bbox: bboxOf(fields.flatMap((f) => f.ring), centre), selectedId: fieldId };
}

export function fromOwn(farmId: string, spec: ContractSpec, parcelId: string | null = null): FarmTarget | null {
  const fields: TargetField[] = spec.parcels
    .filter((p) => (p.boundary?.length ?? 0) >= 3)
    .map((p) => ({ id: p.id, ring: (p.boundary ?? []).map(([lat, lon]): LatLon => [lat, lon]), crop: p.crop ?? null, stage: p.stage ?? null }));
  const points = fields.flatMap((f) => f.ring);
  const location = spec.farm.location;
  let centre: { lat: number; lon: number };
  if (points.length) {
    centre = { lat: points.reduce((s, p) => s + p[0], 0) / points.length, lon: points.reduce((s, p) => s + p[1], 0) / points.length };
  } else if (location) {
    centre = { lat: location[0], lon: location[1] };
  } else {
    return null;
  }
  return { kind: 'own', id: farmId, label: spec.farm.name ?? farmId, fields, centre, bbox: bboxOf(points, centre), selectedId: parcelId };
}

export function inAsean(point: { lat: number; lon: number }): boolean {
  return point.lat >= ASEAN_BOUNDS.s && point.lat <= ASEAN_BOUNDS.n && point.lon >= ASEAN_BOUNDS.w && point.lon <= ASEAN_BOUNDS.e;
}
