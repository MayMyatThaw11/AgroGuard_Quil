import type { OpsAsset, OpsAssetKind, OpsFarm, OpsPaddy, OpsStage } from '../data/ops/types.ts';
import { ApiError } from './apiError.ts';
import { METERS_PER_UNIT } from './ground/groundSpan.ts';

export interface ContractParcel {
  id: string;
  area_ha: number | null;
  crop?: string | null;
  crop_id?: string | null;
  stage?: string | null;
  planted?: string | null;
  standard?: string | null;
  boundary?: [number, number][] | null;
  osm?: string | null;
}

export interface ContractAsset {
  id: string;
  kind: string | null;
  label: string;
  status: string;
  serves: string[];
}

export interface ContractSpec {
  farm: { id: string | null; name: string | null; country: string | null; location: [number, number] | null; standard: string | null };
  parcels: ContractParcel[];
  assets: ContractAsset[];
}

const STAGES: OpsStage[] = ['Tillering', 'Panicle Initiation', 'Flowering', 'Ripening'];
const RIPENESS: Record<OpsStage, number> = {
  Tillering: 0.06,
  'Panicle Initiation': 0.2,
  Flowering: 0.4,
  Ripening: 0.92,
  Unknown: 0.3,
};
const KINDS: OpsAssetKind[] = ['pump', 'gate', 'sluice', 'drone', 'tractor', 'robot'];
const FLOATING: Record<string, [number, number]> = { drone: [0, -1], tractor: [1, 1], robot: [-1, 1] };

export function project(lat: number, lon: number, lat0: number, lon0: number): [number, number] {
  const x = ((lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180)) / METERS_PER_UNIT;
  const z = (-(lat - lat0) * 111320) / METERS_PER_UNIT;
  return [+x.toFixed(2), +z.toFixed(2)];
}

function cropName(cropId: string | null | undefined, crop: string | null | undefined): string {
  if (crop) return crop;
  if (!cropId) return 'Crop not set';
  const words = cropId.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function daysSince(planted: string | null | undefined, today: Date): number {
  if (!planted) return 0;
  const start = Date.parse(`${planted}T00:00:00Z`);
  return Number.isNaN(start) ? 0 : Math.max(0, Math.floor((today.getTime() - start) / 86400000));
}

function centroid(ring: [number, number][]): [number, number] {
  const pts = ring.slice(0, -1);
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

export function contractToOpsFarm(spec: ContractSpec, farmId: string, today = new Date()): OpsFarm | null {
  const location = spec.farm.location;
  if (!location) return null;
  const [lat0, lon0] = location;
  const paddies: OpsPaddy[] = spec.parcels.map((parcel, index) => {
    const ring = parcel.boundary ? parcel.boundary.map(([lat, lon]) => project(lat, lon, lat0, lon0)) : undefined;
    const stage: OpsStage = STAGES.find((s) => s === parcel.stage) ?? 'Unknown';
    const xs = ring ? ring.map((p) => p[0]) : [];
    const zs = ring ? ring.map((p) => p[1]) : [];
    const rect = ring
      ? { x: Math.min(...xs), z: Math.min(...zs), w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) }
      : { x: -78 + (index % 4) * 39, z: -60 + Math.floor(index / 4) * 31, w: 34, d: 26 };
    return {
      id: parcel.id,
      cropId: parcel.crop_id ?? '',
      cropName: cropName(parcel.crop_id, parcel.crop),
      stage,
      daysSincePlanting: daysSince(parcel.planted, today),
      areaHa: parcel.area_ha ?? 0,
      rect,
      ripeness: RIPENESS[stage],
      ...(ring ? { ring } : {}),
      ...(parcel.osm ? { osm: parcel.osm } : {}),
    };
  });
  const byId = new Map(paddies.map((p) => [p.id, p]));
  const real = paddies.some((p) => p.ring);
  const assets: OpsAsset[] = spec.assets
    .filter((a): a is ContractAsset & { kind: OpsAssetKind } => KINDS.includes(a.kind as OpsAssetKind))
    .map((asset, index) => {
      const candidates = asset.serves.map((id) => byId.get(id)).filter((p) => p !== undefined);
      const served = real ? candidates.find((p) => p.ring) : candidates[0];
      let x = 0;
      let z = 0;
      if (served?.ring) {
        [x, z] = served.ring[index % Math.max(1, served.ring.length - 1)];
      } else if (served) {
        x = served.rect.x;
        z = served.rect.z;
      } else {
        const anchor = paddies[0]?.ring ? centroid(paddies[0].ring) : [0, 0];
        const [dx, dz] = FLOATING[asset.kind] ?? [0, 0];
        x = anchor[0] + dx * 12;
        z = anchor[1] + dz * 12;
      }
      return {
        id: asset.id,
        number: index + 1,
        kind: asset.kind,
        label: asset.label,
        status: asset.status === 'online' ? 'Ready' : asset.status,
        reading: null,
        serves: asset.serves,
        position: [x, asset.kind === 'drone' ? 22 : 0, z],
      };
    });
  return {
    id: farmId,
    name: spec.farm.name ?? farmId,
    country: spec.farm.country ?? '',
    region: `${lat0.toFixed(4)}, ${lon0.toFixed(4)}`,
    lat: lat0,
    lon: lon0,
    standard: spec.farm.standard ?? 'none declared',
    paddies,
    assets,
  };
}

export function farmSpan(farm: OpsFarm): { cx: number; cz: number; span: number } | null {
  const rings = farm.paddies.flatMap((p) => p.ring ?? []);
  if (rings.length === 0) return null;
  const xs = rings.map((p) => p[0]);
  const zs = rings.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, span: Math.max(maxX - minX, (maxZ - minZ) * 1.6, 60) };
}

export type ContractLoad = { state: 'loading' } | { state: 'ready'; farm: OpsFarm | null } | { state: 'failed'; error: unknown };

export type OpsFarmChoice =
  | { farm: OpsFarm; fixture: boolean; hasFixture: boolean }
  | { farm: null; loading: boolean; message: string };

export function farmLoadProblem(farmId: string, err: unknown): string {
  if (!(err instanceof ApiError)) return `${farmId} could not be loaded: the farm service is offline`;
  if (err.status === 401) return `Sign in to open ${farmId}`;
  if (err.status === 403) return `Your access code does not cover ${farmId}`;
  if (err.status === 404) return `${farmId} is not registered on this server`;
  return `${farmId} could not be loaded: ${err.message}`;
}

export function chooseOpsFarm(farmId: string, live: boolean, fixture: OpsFarm | null, load: ContractLoad): OpsFarmChoice {
  if (live && load.state === 'ready' && load.farm) return { farm: load.farm, fixture: false, hasFixture: fixture !== null };
  if (fixture) return { farm: fixture, fixture: true, hasFixture: true };
  if (!live) return { farm: null, loading: false, message: `${farmId} is not a demo farm, so it has no demo fixture. Use live data.` };
  if (load.state === 'loading') return { farm: null, loading: true, message: `Loading ${farmId}` };
  if (load.state === 'failed') return { farm: null, loading: false, message: farmLoadProblem(farmId, load.error) };
  return { farm: null, loading: false, message: `The contract for ${farmId} has no readable farm location, so it cannot be drawn or planned` };
}
