import type { AssetKind, OnboardRequest, OnboardResult } from './api.ts';
import type { DemoPaddy, LonLat } from './signinField.ts';

export const FARM_ID = /^[A-Za-z][A-Za-z0-9_-]{1,40}$/;
export const ASSET_ID = /^[A-Za-z][A-Za-z0-9-]{0,30}$/;
export const COUNTRY = /^[A-Z]{2}$/;
export const UTC_OFFSET = /^[+-]\d{2}:\d{2}$/;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const DEMO_FARM_ID = 'farm_ayeyarwady_demo';
export const OUTLINE_SUFFIXES = ['.kml', '.kmz', '.geojson', '.json'] as const;
export const CSV_SUFFIXES = ['.csv'] as const;

export type Boundaries = NonNullable<OnboardRequest['boundaries']>;

export interface AssetDraft {
  id: string;
  kind: AssetKind;
  label: string;
  serves: string;
}

export interface OnboardDraft {
  farmId: string;
  name: string;
  country: string;
  utcOffset: string;
  standard: string;
  registeredBy: string;
  boundaries: Boundaries | null;
  fieldsCsv: string;
  readingsCsv: string;
  inputsCsv: string;
  assets: AssetDraft[];
}

export interface XmlLike {
  getElementsByTagName(name: string): ArrayLike<XmlLike>;
  textContent: string | null;
}

export interface RejectedRow {
  file: 'readings' | 'inputs';
  line: number;
  reason: string;
}

export interface Unlock {
  item: string;
  unlocks: string;
}

export function suffix(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

export function fileProblem(name: string, size: number, allowed: readonly string[]): string | null {
  if (!allowed.includes(suffix(name))) return `${name} is not a ${allowed.join(', ')} file`;
  if (size > MAX_FILE_BYTES) return `${name} is over 2 MB`;
  return null;
}

export function parseCoordinates(text: string): LonLat[] {
  return text
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(',').map(Number))
    .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map((p) => [p[0], p[1]] as LonLat);
}

function closeRing(points: LonLat[]): LonLat[] | null {
  if (points.length < 3) return null;
  const [first, last] = [points[0], points[points.length - 1]];
  const ring = first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
  return ring.length >= 4 ? ring : null;
}

function asOutlines(rings: (LonLat[] | null)[]): DemoPaddy[] {
  return rings.flatMap((ring, i) => (ring ? [{ id: `outline-${i + 1}`, ring }] : []));
}

export function kmlOutlines(doc: XmlLike): DemoPaddy[] {
  return asOutlines(
    Array.from(doc.getElementsByTagName('Polygon')).map((polygon) => {
      const outer = polygon.getElementsByTagName('outerBoundaryIs')[0] ?? polygon;
      return closeRing(parseCoordinates(outer.getElementsByTagName('coordinates')[0]?.textContent ?? ''));
    })
  );
}

function toRing(value: unknown): LonLat[] | null {
  if (!Array.isArray(value)) return null;
  const points = value.filter(
    (p): p is number[] => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
  );
  return closeRing(points.map((p) => [p[0], p[1]] as LonLat));
}

export function geojsonOutlines(text: string): DemoPaddy[] {
  const rings: (LonLat[] | null)[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
    if (obj.type === 'FeatureCollection') list(obj.features).forEach(visit);
    else if (obj.type === 'Feature') visit(obj.geometry);
    else if (obj.type === 'GeometryCollection') list(obj.geometries).forEach(visit);
    else if (obj.type === 'Polygon') rings.push(toRing(list(obj.coordinates)[0]));
    else if (obj.type === 'MultiPolygon') list(obj.coordinates).forEach((polygon) => rings.push(toRing(list(polygon)[0])));
  };
  visit(JSON.parse(text));
  return asOutlines(rings);
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function servesList(text: string): string[] {
  return [...new Set(text.split(/[,\s]+/).filter(Boolean))];
}

export function farmProblems(d: OnboardDraft): string[] {
  const out: string[] = [];
  const name = d.name.trim();
  const by = d.registeredBy.trim();
  if (!FARM_ID.test(d.farmId.trim())) out.push('Farm id starts with a letter, then 1 to 40 letters, digits, _ or -');
  if (!name || name.length > 80) out.push('Farm name needs 1 to 80 characters');
  if (!COUNTRY.test(d.country.trim().toUpperCase())) out.push('Country is a two-letter code, such as MM');
  if (d.utcOffset.trim() && !UTC_OFFSET.test(d.utcOffset.trim())) out.push('UTC offset looks like +06:30');
  if (!by || by.length > 80) out.push('Registered by needs your name, up to 80 characters');
  return out;
}

export function fileProblems(d: OnboardDraft): string[] {
  const out: string[] = [];
  if (!d.boundaries && !d.fieldsCsv.trim()) out.push('Add field outlines or a field sheet');
  const seen = new Set<string>();
  d.assets.forEach((asset, i) => {
    const id = asset.id.trim();
    const label = asset.label.trim();
    if (!ASSET_ID.test(id)) out.push(`Machine ${i + 1}: id starts with a letter, then up to 30 letters, digits or -`);
    else if (seen.has(id)) out.push(`Machine ${i + 1}: id ${id} is used twice`);
    seen.add(id);
    if (!label || label.length > 60) out.push(`Machine ${i + 1}: name needs 1 to 60 characters`);
  });
  return out;
}

export function onboardBody(d: OnboardDraft): OnboardRequest {
  const body: OnboardRequest = {
    name: d.name.trim(),
    country: d.country.trim().toUpperCase(),
    registered_by: d.registeredBy.trim(),
  };
  if (d.utcOffset.trim()) body.utc_offset = d.utcOffset.trim();
  if (d.standard.trim()) body.standard = d.standard.trim();
  if (d.boundaries) body.boundaries = d.boundaries;
  if (d.fieldsCsv.trim()) body.fields_csv = d.fieldsCsv;
  if (d.readingsCsv.trim()) body.readings_csv = d.readingsCsv;
  if (d.inputsCsv.trim()) body.inputs_csv = d.inputsCsv;
  if (d.assets.length) {
    body.assets = d.assets.map((a) => ({ id: a.id.trim(), kind: a.kind, label: a.label.trim(), serves: servesList(a.serves) }));
  }
  return body;
}

export function missingUnlocks(d: OnboardDraft): Unlock[] {
  const out: Unlock[] = [];
  if (!d.fieldsCsv.trim()) {
    out.push({
      item: 'Field sheet (crop, planting date and stage)',
      unlocks: 'A live weekly plan, weather, soil, the land screen, and spray safety for the last 30 days',
    });
  }
  if (!d.inputsCsv.trim()) {
    out.push({
      item: 'Spray and fertiliser notebook (inputs sheet)',
      unlocks: "Each past spray checked against the weather at that hour, inputs not allowed under the farm's standard, and nitrogen against the contract cap",
    });
  }
  if (!d.readingsCsv.trim()) {
    out.push({
      item: 'Two to four weeks of water tube readings',
      unlocks: "The water model scored against the farm's own readings, and the farm's seepage measured",
    });
  }
  if (!d.assets.length) out.push({ item: 'Pumps, drones, gates and sluices', unlocks: 'Shared-machine planning' });
  if (!d.standard.trim()) out.push({ item: "The buyer's or certifier's rules (standard)", unlocks: 'The contract rules' });
  return out;
}

export function rejectedRows(result: OnboardResult): RejectedRow[] {
  return [
    ...(result.readings?.rejected ?? []).map((r) => ({ file: 'readings' as const, ...r })),
    ...(result.inputs?.rejected ?? []).map((r) => ({ file: 'inputs' as const, ...r })),
  ];
}

export function onboardErrorText(status: number | null, message: string, farmId: string): string {
  if (status === 401) return 'Sign in first';
  if (status === 403) return `This code has no access to farm ${farmId}`;
  if (status === 422 && message.startsWith('[')) {
    try {
      const items: unknown = JSON.parse(message);
      if (Array.isArray(items)) {
        const lines = items.map((item) => {
          const d = (item ?? {}) as { message?: unknown; msg?: unknown; line?: unknown };
          const text = String(d.message ?? d.msg ?? '');
          return typeof d.line === 'number' ? `line ${d.line}: ${text}` : text;
        });
        const joined = lines.filter(Boolean).join('; ');
        if (joined) return joined;
      }
    } catch {
      return message;
    }
  }
  return message;
}

export function currentFarmId(search: string): string {
  return new URLSearchParams(search).get('farm') || DEMO_FARM_ID;
}

export function farmHref(search: string, farmId: string): string {
  const params = new URLSearchParams(search);
  params.set('farm', farmId);
  return `?${params.toString()}`;
}
