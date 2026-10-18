import type { FarmMap } from './farmMapData.ts';
import { haversineKm } from './farmMapRandom.ts';
import { CROPS } from './farmMapTheme.ts';
import type { Farm, Poi, PoiType } from './farmMapTypes.ts';
import type { SearchResult } from './farmMapViewTypes.ts';

const COORDINATES = /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/;

export function parseCoordinates(query: string): SearchResult[] | null {
  const m = query.trim().match(COORDINATES);
  if (!m) return null;
  const lat = +m[1];
  const lon = +m[2];
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
