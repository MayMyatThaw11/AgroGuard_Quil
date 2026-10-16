import type { ContractSpec } from './contractFarm.ts';

export type LonLat = [number, number];

export interface DemoPaddy {
  id: string;
  ring: LonLat[];
}

export interface DemoField {
  name: string;
  location: LonLat | null;
  paddies: DemoPaddy[];
  areaHa: number | null;
}

export interface FieldBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface SvgPaddy {
  id: string;
  d: string;
  cx: number;
  cy: number;
}

export interface DailyWeather {
  temp_min_degc?: number | null;
  temp_max_degc?: number | null;
  precipitation_mm?: number | null;
  wind_speed_max_ms?: number | null;
}

export interface LedgerFact {
  text: string;
  ok: boolean;
}

const signed = (value: number, digits: number) => `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}`;

const finite = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

export function demoField(contract: ContractSpec | null | undefined): DemoField | null {
  if (!contract) return null;
  const paddies = contract.parcels
    .filter((parcel) => (parcel.boundary?.length ?? 0) >= 4)
    .map((parcel) => ({ id: parcel.id, ring: (parcel.boundary ?? []).map(([lat, lon]) => [lon, lat] as LonLat) }));
  const areas = contract.parcels.map((parcel) => parcel.area_ha).filter(finite);
  const location = contract.farm.location ? ([contract.farm.location[1], contract.farm.location[0]] as LonLat) : null;
  return {
    name: contract.farm.name ?? contract.farm.id ?? 'Demo farm',
    location,
    paddies,
    areaHa: areas.length ? +areas.reduce((sum, area) => sum + area, 0).toFixed(2) : null,
  };
}

export function fieldBounds(paddies: readonly DemoPaddy[]): FieldBounds | null {
  const points = paddies.flatMap((paddy) => paddy.ring);
  if (!points.length) return null;
  return {
    west: Math.min(...points.map((p) => p[0])),
    south: Math.min(...points.map((p) => p[1])),
    east: Math.max(...points.map((p) => p[0])),
    north: Math.max(...points.map((p) => p[1])),
  };
}

export function paddyFeatures(paddies: readonly DemoPaddy[]) {
  return {
    type: 'FeatureCollection' as const,
    features: paddies.map((paddy) => ({
      type: 'Feature' as const,
      properties: { id: paddy.id },
      geometry: { type: 'Polygon' as const, coordinates: [paddy.ring] },
    })),
  };
}

export function svgPaddies(paddies: readonly DemoPaddy[], width: number, height: number, pad: number): SvgPaddy[] {
  const box = fieldBounds(paddies);
  if (!box) return [];
  const kx = Math.cos((((box.north + box.south) / 2) * Math.PI) / 180);
  const spanX = Math.max((box.east - box.west) * kx, 1e-9);
  const spanY = Math.max(box.north - box.south, 1e-9);
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  const at = ([lon, lat]: LonLat): [number, number] => [offX + (lon - box.west) * kx * scale, offY + (box.north - lat) * scale];
  return paddies.map((paddy) => {
    const pts = paddy.ring.map(at);
    const corners = pts.slice(0, -1);
    return {
      id: paddy.id,
      d: `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`,
      cx: +(corners.reduce((s, p) => s + p[0], 0) / corners.length).toFixed(1),
      cy: +(corners.reduce((s, p) => s + p[1], 0) / corners.length).toFixed(1),
    };
  });
}

export function weatherLine(day: DailyWeather | null | undefined): string | null {
  if (!day) return null;
  const parts: string[] = [];
  if (finite(day.temp_min_degc) && finite(day.temp_max_degc)) parts.push(`${signed(day.temp_min_degc, 0)}–${signed(day.temp_max_degc, 0)} °C`);
  if (finite(day.precipitation_mm)) parts.push(`rain ${day.precipitation_mm.toFixed(1)} mm`);
  if (finite(day.wind_speed_max_ms)) parts.push(`wind up to ${day.wind_speed_max_ms.toFixed(1)} m/s`);
  return parts.length ? parts.join(' · ') : null;
}

export function ledgerFact(ledger: { valid: boolean; entries: readonly unknown[] }): LedgerFact {
  const count = ledger.entries.length.toLocaleString('en-US');
  const noun = ledger.entries.length === 1 ? 'record' : 'records';
  return ledger.valid
    ? { text: `${count} ${noun} · chain verified`, ok: true }
    : { text: `${count} ${noun} · chain check failed`, ok: false };
}
