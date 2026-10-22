import { ringAreaHa, tracedRing, type Corner } from './trace.ts';

export const OSM_ENDPOINTS: readonly string[] = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const MIRROR_TIMEOUT_MS = 15000;
const SEARCH_M = 500;
const LAND = '^(farmland|paddy|orchard|plantation|meadow)$';

export interface OsmOutline {
  corners: Corner[];
  osmId: string;
  landuse: string;
  areaHa: number;
}

interface OverpassWay {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

export function outlineQuery(lat: number, lon: number): string {
  const p = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  return `[out:json][timeout:15];way(around:${SEARCH_M},${p})["landuse"~"${LAND}"];out tags geom;`;
}

export function insideRing(point: Corner, ring: Corner[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > point[0] !== yj > point[0] && point[1] < ((xj - xi) * (point[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pickOutline(raw: unknown, point: Corner): OsmOutline | null {
  const elements = (raw as { elements?: OverpassWay[] } | null)?.elements ?? [];
  const found = elements
    .filter((e) => e.type === 'way' && (e.geometry?.length ?? 0) >= 4)
    .map((e) => {
      const ring = (e.geometry ?? []).map((g): Corner => [g.lat, g.lon]);
      const [first, last] = [ring[0], ring[ring.length - 1]];
      const open = first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
      return { corners: open, osmId: `way/${e.id}`, landuse: e.tags?.landuse ?? 'unknown', areaHa: ringAreaHa(tracedRing(open)) };
    })
    .filter((o) => o.corners.length >= 3 && o.areaHa > 0 && insideRing(point, o.corners));
  return found.sort((a, b) => a.areaHa - b.areaHa)[0] ?? null;
}

export async function suggestOutline(lat: number, lon: number, fetcher: typeof fetch = fetch): Promise<OsmOutline | null> {
  const body = `data=${encodeURIComponent(outlineQuery(lat, lon))}`;
  let last: unknown = null;
  for (const endpoint of OSM_ENDPOINTS) {
    try {
      const res = await fetcher(endpoint, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(MIRROR_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      return pickOutline(await res.json(), [lat, lon]);
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error('Overpass unavailable');
}
