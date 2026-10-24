import type { FarmMap } from './farmMapData.ts';
import { haversineKm } from './farmMapRandom.ts';
import { CROPS } from './farmMapTheme.ts';
import type { Farm, Poi, PoiType } from './farmMapTypes.ts';
import type { SearchResult } from './farmMapViewTypes.ts';

const COORDINATES = /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/;
const NUMBER = /(-?\d+(?:\.\d+)?)/.source;
const PIN = new RegExp(`!3d${NUMBER}!4d${NUMBER}`);
const VIEWPORT = new RegExp(`@${NUMBER},${NUMBER}`);
const PARAM = new RegExp(`[?&](?:q|ll|query|center|destination)=${NUMBER}(?:,|%2C)(?:%20|\\s)*${NUMBER}`, 'i');
const DMS = /(\d{1,3})\s*°\s*(?:(\d{1,2})\s*['′]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*["″]\s*)?([NSEW])/gi;
const SHORT_LINK = /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i;

export function mapLinkProblem(query: string): 'short' | null {
  return SHORT_LINK.test(query.trim()) ? 'short' : null;
}

function fromLink(text: string): [number, number] | null {
  const hit = text.match(PIN) ?? text.match(PARAM) ?? text.match(VIEWPORT);
  return hit ? [+hit[1], +hit[2]] : null;
}

function fromDms(text: string): [number, number] | null {
  const parts = [...text.matchAll(DMS)].map((m) => {
    const value = +m[1] + (m[2] ? +m[2] / 60 : 0) + (m[3] ? +m[3] / 3600 : 0);
    return { value: /[SW]/i.test(m[4]) ? -value : value, axis: /[NS]/i.test(m[4]) ? 'lat' : 'lon' };
  });
  const lat = parts.find((p) => p.axis === 'lat');
  const lon = parts.find((p) => p.axis === 'lon');
  return lat && lon ? [lat.value, lon.value] : null;
}

function safeDecode(text: string): string {
  try {
    return decodeURI(text);
  } catch {
    return text;
  }
}

export function parseCoordinates(query: string): SearchResult[] | null {
  const text = query.trim();
  if (mapLinkProblem(text)) return [];
  const plain = text.match(COORDINATES);
  const found: [number, number] | null = plain ? [+plain[1], +plain[2]] : /^https?:\/\//i.test(text) ? fromLink(safeDecode(text)) : fromDms(text);
  if (!found) return null;
  const [lat, lon] = found;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
  return [{ kind: 'coord', id: 'c', title: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, sub: 'Go to coordinates', lat, lon, score: 0 }];
}

export function searchFarmMap(map: FarmMap, query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hit = (text: string | undefined) => !!text && text.toLowerCase().includes(q);
  const out: SearchResult[] = [];
  map.anchors.forEach((a) => {
    if (hit(a.town) || hit(a.country)) {
      out.push({
        kind: 'place', id: a.id, title: a.town, lat: a.lat, lon: a.lon,
        sub: `${a.country} · ${a.farms.length} farms · ${CROPS[a.crop].label}`,
        score: hit(a.town) && a.town.toLowerCase().startsWith(q) ? 0 : 1,
      });
    }
  });
  map.farms.forEach((f) => {
    if (hit(f.id) || hit(f.name) || hit(CROPS[f.crop].label)) {
      out.push({
        kind: 'farm', id: f.id, title: f.name, lat: f.lat, lon: f.lon,
        sub: `${f.id} · ${CROPS[f.crop].label} · ${f.area} ha · ${f.town}`,
        score: hit(f.id) ? 0 : 2,
      });
    }
  });
  map.pois.forEach((p) => {
    if ((p.type === 'market' || p.type === 'storage' || p.type === 'mill') && hit(p.label)) {
      out.push({ kind: p.type, id: p.id, title: p.label, sub: `${p.town}, ${p.country}`, lat: p.lat, lon: p.lon, score: 3 });
    }
  });
  return out.sort((a, b) => a.score - b.score).slice(0, 30);
}

export function nearestPoi(map: FarmMap, farm: Farm, type: PoiType): { poi: Poi; km: number } | null {
  let best: { poi: Poi; km: number } | null = null;
  map.pois.forEach((poi) => {
    if (poi.type !== type || poi.anchor !== farm.anchor) return;
    const km = haversineKm(farm, poi);
    if (!best || km < best.km) best = { poi, km };
  });
  return best;
}
