import outlines from '../../data/demoFields/outlines.json' with { type: 'json' };
import type { FarmOutline, Position } from './farmMapTypes.ts';

type Saved = { osm: string; landuse: string; ring: [number, number][]; areaHa: number };

const saved = outlines as unknown as Record<string, Saved[]>;

export function demoOutline(anchorId: string, index: number): FarmOutline | null {
  const row = saved[anchorId]?.[index];
  if (!row) return null;
  const ring = row.ring.map(([lat, lon]): Position => [lon, lat]);
  return { id: row.osm, landuse: row.landuse, ring: [...ring, ring[0]], areaHa: row.areaHa };
}

export function outlineCentre(ring: Position[]): { lat: number; lon: number } {
  let twice = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const w = x0 * y1 - x1 * y0;
    twice += w;
    cx += (x0 + x1) * w;
    cy += (y0 + y1) * w;
  }
  return { lat: +(cy / (3 * twice)).toFixed(5), lon: +(cx / (3 * twice)).toFixed(5) };
}
