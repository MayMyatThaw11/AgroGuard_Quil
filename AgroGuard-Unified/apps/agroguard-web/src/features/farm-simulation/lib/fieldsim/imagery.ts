import { SAT_MAX_ZOOM, SAT_TILES } from '../farmmap/basemapTheme.ts';

export interface BBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

const tileX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
export const tileLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
export const tileLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

export function tilesFor(box: BBox, maxTiles = 16) {
  for (let z = SAT_MAX_ZOOM; z >= 1; z--) {
    const x0 = Math.floor(tileX(box.minLon, z));
    const x1 = Math.floor(tileX(box.maxLon, z));
    const y0 = Math.floor(tileY(box.maxLat, z));
    const y1 = Math.floor(tileY(box.minLat, z));
    const cols = x1 - x0 + 1;
    const rows = y1 - y0 + 1;
    if (cols * rows <= maxTiles) {
      const tiles = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push({ x, y });
      return { z, x0, y0, cols, rows, tiles, north: tileLat(y0, z), south: tileLat(y1 + 1, z), west: tileLon(x0, z), east: tileLon(x1 + 1, z) };
    }
  }
  return { z: 0, x0: 0, y0: 0, cols: 1, rows: 1, tiles: [{ x: 0, y: 0 }], north: 85, south: -85, west: -180, east: 180 };
}

export const tileUrl = (z: number, x: number, y: number) => SAT_TILES.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
