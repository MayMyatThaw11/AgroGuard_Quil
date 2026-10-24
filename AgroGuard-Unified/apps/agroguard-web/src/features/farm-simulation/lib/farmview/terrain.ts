import { tileX, tileY, type BBox } from '../fieldsim/imagery.ts';
import { inside, type XZ } from '../fieldsim/localFrame.ts';

export const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const DEM_MAX_ZOOM = 14;
export const RELIEF_ATTRIBUTION = 'Relief about 30 m: AWS Terrain Tiles (SRTM, GMTED, ETOPO)';
export const NEIGHBOURHOOD_HALF_KM = 1.5;
export const FAR_HALF_KM = 5;
const FARM_PAD_M = 150;
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32;
const EQUATOR_M_PER_PIXEL_Z0 = 156543.03392;
const TILE = 256;

export const demUrl = (z: number, x: number, y: number) => DEM_TILES.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

export const decodeTerrarium = (r: number, g: number, b: number): number => r * 256 + g + b / 256 - 32768;

export interface Heightfield {
  z: number;
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  data: Float32Array;
}

export interface Rings {
  farm: BBox;
  neighbourhood: BBox;
  far: BBox;
}

export function boxAround(lat: number, lon: number, halfKm: number): BBox {
  const dLat = halfKm / KM_PER_DEG_LAT;
  const dLon = halfKm / (KM_PER_DEG_LON * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}

export function ringPlan(farmBox: BBox, centre: { lat: number; lon: number }): Rings {
  const padLat = FARM_PAD_M / 1000 / KM_PER_DEG_LAT;
  const padLon = FARM_PAD_M / 1000 / (KM_PER_DEG_LON * Math.cos((centre.lat * Math.PI) / 180));
  return {
    farm: { minLat: farmBox.minLat - padLat, maxLat: farmBox.maxLat + padLat, minLon: farmBox.minLon - padLon, maxLon: farmBox.maxLon + padLon },
    neighbourhood: boxAround(centre.lat, centre.lon, NEIGHBOURHOOD_HALF_KM),
    far: boxAround(centre.lat, centre.lon, FAR_HALF_KM),
  };
}

export function heightAt(field: Heightfield, lat: number, lon: number): number | null {
  const width = field.cols * TILE;
  const height = field.rows * TILE;
  const u = (tileX(lon, field.z) - field.x0) * TILE - 0.5;
  const v = (tileY(lat, field.z) - field.y0) * TILE - 0.5;
  if (!(u >= 0 && v >= 0 && u <= width - 1 && v <= height - 1)) return null;
  const x = Math.min(width - 2, Math.floor(u));
  const y = Math.min(height - 2, Math.floor(v));
  const fx = u - x;
  const fy = v - y;
  const at = (xi: number, yi: number) => field.data[yi * width + xi];
  const top = at(x, y) * (1 - fx) + at(x + 1, y) * fx;
  const bottom = at(x, y + 1) * (1 - fx) + at(x + 1, y + 1) * fx;
  const h = top * (1 - fy) + bottom * fy;
  return Number.isFinite(h) ? h : null;
}

export interface TilePlan {
  z: number;
  x0: number;
  y0: number;
  cols: number;
  rows: number;
}

export function heightfieldFromTiles(plan: TilePlan, readTile: (x: number, y: number) => ArrayLike<number> | null): Heightfield {
  const width = plan.cols * TILE;
  const data = new Float32Array(width * plan.rows * TILE).fill(Number.NaN);
  for (let ty = 0; ty < plan.rows; ty += 1) {
    for (let tx = 0; tx < plan.cols; tx += 1) {
      const rgba = readTile(plan.x0 + tx, plan.y0 + ty);
      if (!rgba) continue;
      for (let py = 0; py < TILE; py += 1) {
        for (let px = 0; px < TILE; px += 1) {
          const i = (py * TILE + px) * 4;
          data[(ty * TILE + py) * width + tx * TILE + px] = decodeTerrarium(rgba[i], rgba[i + 1], rgba[i + 2]);
        }
      }
    }
  }
  return { ...plan, data };
}

export function ringDistance(x: number, z: number, ring: readonly XZ[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = dx * dx + dz * dz;
    const t = len === 0 ? 0 : clamp(((x - x1) * dx + (z - z1) * dz) / len, 0, 1);
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz)));
  }
  return inside([x, z], ring) ? -best : best;
}

export function padBlend(terrain: number, distanceM: number, pad: number, falloffM: number): number {
  if (distanceM <= 0) return pad;
  if (distanceM >= falloffM) return terrain;
  const t = distanceM / falloffM;
  const eased = t * t * (3 - 2 * t);
  return pad + (terrain - pad) * eased;
}

export interface SlopeStats {
  meanDeg: number;
  p90Deg: number;
}

export function slopeStats(field: Heightfield, lat: number, lon: number, halfM: number): SlopeStats | null {
  const width = field.cols * TILE;
  const height = field.rows * TILE;
  const metresPerPixel = (EQUATOR_M_PER_PIXEL_Z0 * Math.cos((lat * Math.PI) / 180)) / 2 ** field.z;
  const cx = (tileX(lon, field.z) - field.x0) * TILE;
  const cy = (tileY(lat, field.z) - field.y0) * TILE;
  const half = halfM / metresPerPixel;
  const x0 = Math.max(1, Math.ceil(cx - half));
  const x1 = Math.min(width - 2, Math.floor(cx + half));
  const y0 = Math.max(1, Math.ceil(cy - half));
  const y1 = Math.min(height - 2, Math.floor(cy + half));
  const degrees: number[] = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = (field.data[y * width + x + 1] - field.data[y * width + x - 1]) / (2 * metresPerPixel);
      const dy = (field.data[(y + 1) * width + x] - field.data[(y - 1) * width + x]) / (2 * metresPerPixel);
      degrees.push((Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI);
    }
  }
  if (!degrees.length) return null;
  degrees.sort((a, b) => a - b);
  return { meanDeg: degrees.reduce((s, d) => s + d, 0) / degrees.length, p90Deg: degrees[Math.min(degrees.length - 1, Math.floor(degrees.length * 0.9))] };
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraLimits {
  halfM: number;
  minAbove: number;
  maxDistance: number;
  groundAt: (x: number, z: number) => number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampCamera(pos: Vec3, target: Vec3, limits: CameraLimits): { pos: Vec3; target: Vec3 } {
  const t: Vec3 = { x: clamp(target.x, -limits.halfM, limits.halfM), y: target.y, z: clamp(target.z, -limits.halfM, limits.halfM) };
  const off: Vec3 = { x: pos.x - t.x, y: pos.y - t.y, z: pos.z - t.z };
  for (let pass = 0; pass < 3; pass += 1) {
    const length = Math.hypot(off.x, off.y, off.z);
    if (length > limits.maxDistance) {
      const k = limits.maxDistance / length;
      off.x *= k;
      off.y *= k;
      off.z *= k;
    }
    const minY = limits.groundAt(t.x + off.x, t.z + off.z) + limits.minAbove;
    if (t.y + off.y < minY) off.y = minY - t.y;
  }
  const level = Math.hypot(off.x, off.z);
  const room = Math.sqrt(Math.max(0, limits.maxDistance ** 2 - off.y ** 2));
  if (level > room) {
    const k = level === 0 ? 0 : room / level;
    off.x *= k;
    off.z *= k;
  }
  return { pos: { x: t.x + off.x, y: t.y + off.y, z: t.z + off.z }, target: t };
}

export const fogDensity = (edgeM: number): number => Math.sqrt(-Math.log(0.02)) / edgeM;

const MAX_RISE = 8;
const LIFT_STEP = 1.15;
const SIGHT_SAMPLES = 40;

export function clearView(eye: Vec3, target: Vec3, groundAt: (x: number, z: number) => number, margin: number): Vec3 {
  let y = eye.y;
  const ceiling = eye.y * MAX_RISE;
  while (y < ceiling) {
    let hidden = false;
    for (let i = 1; i < SIGHT_SAMPLES - 3; i += 1) {
      const t = i / SIGHT_SAMPLES;
      const x = eye.x + (target.x - eye.x) * t;
      const z = eye.z + (target.z - eye.z) * t;
      if (y + (target.y - y) * t < groundAt(x, z) + margin) {
        hidden = true;
        break;
      }
    }
    if (!hidden) return { x: eye.x, y, z: eye.z };
    y = Math.min(ceiling, y * LIFT_STEP + 1);
  }
  return { x: eye.x, y: ceiling, z: eye.z };
}
