import type { FarmMonitoring, HarvestReference } from '../api.ts';
import type { ContractSpec } from '../contractFarm.ts';
import type { FarmStatus, PointFeature, PolygonFeature, Position } from './farmMapTypes.ts';

export type OwnStatus = FarmStatus | 'unknown';

export interface OwnFeatureProps {
  farm: string;
  parcel: string;
  name: string;
  kind: string;
  status: OwnStatus;
}

export interface OwnFeatures {
  polygons: PolygonFeature<OwnFeatureProps>[];
  points: PointFeature<OwnFeatureProps>[];
}

export interface StorageReader {
  getItem(key: string): string | null;
}

export interface StorageWriter extends StorageReader {
  setItem(key: string, value: string): void;
}

export interface CropLocal {
  crop: string | null;
  confidencePercent: number | null;
  soilPh: number;
  rainfallMm: number;
  temperatureC: number;
  source: string | null;
  region: string | null;
  trainedOn: string | null;
  validatedOnFieldData: boolean | null;
  lat: number | null;
  lon: number | null;
  capturedAt: string | null;
}

export interface AdvisoryLocal {
  status: string;
  reasonCode: string | null;
  reason: string | null;
  dataQuality: string | null;
  netDepthMm: number | null;
  mode: string | null;
  cropType: string | null;
  fieldId: number | null;
  capturedAt: string | null;
}

export interface PaddyInput {
  id: string;
  depthCm: number | null;
  flags: { observed_at: string }[];
  conflicting: boolean;
}

export interface StatusInputs {
  assessment: { status: string; createdAt: string } | null;
  activeDevices: number | null;
  paddies: PaddyInput[];
  now: Date;
}

export const AWD_SAFE_DEPTH_CM = -15;
const FLAG_WINDOW_H = 72;
const ASSESSMENT_MAX_AGE_H = 72;
const CROP_KEY = 'agroguard.lastCropConditions';
const ADVISORY_KEY = 'agroguard.lastWaterAdvisory';
const LINK_PREFIX = 'agriquill.agroguardField.';

function closed(ring: [number, number][] | null | undefined): ring is [number, number][] {
  if (!ring || ring.length < 4) return false;
  const [a, b] = [ring[0], ring[ring.length - 1]];
  return a[0] === b[0] && a[1] === b[1];
}

export function contractFeatures(farmId: string, spec: ContractSpec, statuses: Record<string, OwnStatus>, seed = false): OwnFeatures {
  const name = spec.farm.name ?? farmId;
  const kind = seed ? 'Demo farm' : 'Your farm';
  const polygons: PolygonFeature<OwnFeatureProps>[] = [];
  for (const parcel of spec.parcels) {
    if (!closed(parcel.boundary)) continue;
    const ring: Position[] = parcel.boundary.map(([lat, lon]) => [lon, lat]);
    polygons.push({
      type: 'Feature',
      properties: { farm: farmId, parcel: parcel.id, name, kind, status: statuses[parcel.id] ?? 'unknown' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  }
  const location = spec.farm.location;
  const points: PointFeature<OwnFeatureProps>[] =
    polygons.length === 0 && location
      ? [{
          type: 'Feature',
          properties: { farm: farmId, parcel: '', name, kind, status: statuses[''] ?? 'unknown' },
          geometry: { type: 'Point', coordinates: [location[1], location[0]] },
        }]
      : [];
  return { polygons, points };
}

export function farmCentroid(spec: ContractSpec): { lat: number; lon: number } | null {
  const corners = spec.parcels.flatMap((p) => (closed(p.boundary) ? p.boundary.slice(0, -1) : []));
  if (corners.length > 0) {
    return {
      lat: corners.reduce((s, c) => s + c[0], 0) / corners.length,
      lon: corners.reduce((s, c) => s + c[1], 0) / corners.length,
    };
  }
  const location = spec.farm.location;
  return location ? { lat: location[0], lon: location[1] } : null;
}

function hoursBetween(later: Date, iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : (later.getTime() - t) / 3600000;
}

export function replicaStatus(inputs: StatusInputs): { status: OwnStatus; reasons: string[] } {
  const risk: string[] = [];
  const watch: string[] = [];
  const unknown: string[] = [];
  const basis: string[] = [];

  const a = inputs.assessment;
  if (!a) {
    unknown.push('no linked AgroGuard field assessment');
  } else if (inputs.activeDevices === 0) {
    unknown.push('linked AgroGuard field has no active device');
  } else {
    const age = hoursBetween(inputs.now, a.createdAt);
    if (age === null || age > ASSESSMENT_MAX_AGE_H) {
      unknown.push(`linked AgroGuard assessment is older than ${ASSESSMENT_MAX_AGE_H} h`);
    } else {
      basis.push(`linked AgroGuard assessment is ${a.status}`);
      if (a.status === 'critical') risk.push('linked AgroGuard field assessment is critical');
      else if (a.status === 'warning') watch.push('linked AgroGuard field assessment is warning');
    }
  }

  if (inputs.paddies.length === 0) unknown.push('no tube reading on any parcel');
  for (const p of inputs.paddies) {
    if (p.conflicting) {
      basis.push(`${p.id}: readings disagree`);
      watch.push(`${p.id}: unknown, readings disagree`);
      continue;
    }
    if (p.depthCm === null) {
      unknown.push(`${p.id}: no tube reading`);
      continue;
    }
    basis.push(`${p.id}: water depth ${p.depthCm} cm, above the AWD floor`);
    if (p.depthCm < AWD_SAFE_DEPTH_CM) risk.push(`${p.id}: water depth ${p.depthCm} cm is below the AWD floor of ${AWD_SAFE_DEPTH_CM} cm`);
    const recent = p.flags.filter((f) => {
      const age = hoursBetween(inputs.now, f.observed_at);
      return age !== null && age <= FLAG_WINDOW_H;
    });
    if (recent.length > 0) watch.push(`${p.id}: ${recent.length} Kalman flag(s) in the last ${FLAG_WINDOW_H} h`);
  }

  if (risk.length > 0) return { status: 'risk', reasons: [...risk, ...watch] };
  if (watch.length > 0) return { status: 'watch', reasons: watch };
  if (basis.length > 0) return { status: 'ok', reasons: [`Based only on: ${basis.join('; ')}`, ...unknown.map((u) => `Not checked: ${u}`)] };
  return { status: 'unknown', reasons: unknown };
}

function parse(storage: StorageReader, key: string): Record<string, unknown> | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function readAgroguardLocal(storage: StorageReader): { crop: CropLocal | null; advisory: AdvisoryLocal | null } {
  const c = parse(storage, CROP_KEY);
  const soilPh = num(c?.soil_pH);
  const rainfallMm = num(c?.rainfall_mm);
  const temperatureC = num(c?.temperature_c);
  const model = c?.modelInfo && typeof c.modelInfo === 'object' ? (c.modelInfo as Record<string, unknown>) : null;
  const crop: CropLocal | null =
    c && soilPh !== null && rainfallMm !== null && temperatureC !== null
      ? {
          crop: str(c.crop),
          confidencePercent: num(c.confidencePercent),
          soilPh,
          rainfallMm,
          temperatureC,
          source: str(c.source),
          region: str(c.region),
          trainedOn: str(model?.trainedOn),
          validatedOnFieldData: typeof model?.validatedOnFieldData === 'boolean' ? model.validatedOnFieldData : null,
          lat: num(c.lat),
          lon: num(c.lon),
          capturedAt: str(c.capturedAt),
        }
      : null;
  const w = parse(storage, ADVISORY_KEY);
  const advisory: AdvisoryLocal | null =
    w && typeof w.status === 'string'
      ? {
          status: w.status,
          reasonCode: str(w.reasonCode),
          reason: str(w.reason),
          dataQuality: str(w.dataQuality),
          netDepthMm: num(w.netDepthMm),
          mode: str(w.mode),
          cropType: str(w.cropType),
          fieldId: num(w.fieldId),
          capturedAt: str(w.capturedAt),
        }
      : null;
  return { crop, advisory };
}

export const PAW_SAN_T_HA: readonly [number, number] = [2.6, 3.37];
const M2_PER_HA = 10000;
const PAW_SAN = /paw\s*san/i;

export function advisoryLitres(advisory: AdvisoryLocal | null, linked: number | null, areaHa: number): { litres: number | null; reason: string | null } {
  const none = (reason: string) => ({ litres: null, reason });
  if (!advisory) return none('no water advice saved in this browser');
  if (linked === null) return none('link the AgroGuard field the water advice was made for');
  if (advisory.fieldId !== linked) return none(`the water advice was made for AgroGuard field ${advisory.fieldId ?? 'unknown'}, not the linked field ${linked}`);
  if (advisory.netDepthMm === null) return none('the water advice computed no deficit');
  if (!(areaHa > 0)) return none('the boundary has no measured area');
  return { litres: Math.round(advisory.netDepthMm * areaHa * M2_PER_HA), reason: null };
}

export function pawSanHarvest(spec: ContractSpec): { areaHa: number; lowT: number; highT: number } | null {
  const areaHa = spec.parcels.filter((p) => p.crop && PAW_SAN.test(p.crop)).reduce((s, p) => s + (p.area_ha ?? 0), 0);
  if (!(areaHa > 0)) return null;
  const round2 = (v: number) => Math.round(v * 100) / 100;
  return { areaHa: round2(areaHa), lowT: round2(areaHa * PAW_SAN_T_HA[0]), highT: round2(areaHa * PAW_SAN_T_HA[1]) };
}

export function nationalHarvest(ref: HarvestReference | null): { areaHa: number; lowT: number; highT: number; year: number | null } | null {
  const priced = (ref?.parcels ?? []).filter((p) => p.tonnes);
  if (priced.length === 0) return null;
  const round2 = (v: number) => Math.round(v * 100) / 100;
  return {
    areaHa: round2(priced.reduce((s, p) => s + (p.area_ha ?? 0), 0)),
    lowT: round2(priced.reduce((s, p) => s + (p.tonnes?.[0] ?? 0), 0)),
    highT: round2(priced.reduce((s, p) => s + (p.tonnes?.[1] ?? 0), 0)),
    year: priced[0].yield?.year ?? null,
  };
}

export function linkedField(storage: StorageReader, farmId: string): number | null {
  try {
    const raw = storage.getItem(LINK_PREFIX + farmId);
    const id = raw === null ? NaN : Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function setLinkedField(storage: StorageWriter, farmId: string, fieldId: number | null): void {
  try {
    storage.setItem(LINK_PREFIX + farmId, fieldId === null ? '' : String(fieldId));
  } catch {
    return;
  }
}

export function paddyInputs(monitoring: FarmMonitoring | null): PaddyInput[] {
  return (monitoring?.paddies ?? []).map((p) => ({
    id: p.id,
    depthCm: p.model?.depth_cm ?? null,
    flags: p.model?.flags ?? [],
    conflicting: p.model === null && p.missing.some((m) => m.reason.includes('conflicting readings')),
  }));
}

export function parcelStatuses(spec: ContractSpec, base: Omit<StatusInputs, 'paddies'>, paddies: PaddyInput[]): Record<string, OwnStatus> {
  const byId = new Map(paddies.map((p) => [p.id, p]));
  const out: Record<string, OwnStatus> = { '': replicaStatus({ ...base, paddies }).status };
  for (const parcel of spec.parcels) {
    const own = byId.get(parcel.id);
    out[parcel.id] = replicaStatus({ ...base, paddies: own ? [own] : [] }).status;
  }
  return out;
}
