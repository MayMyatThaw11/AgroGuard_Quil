import { tileX, tileY, type BBox } from '../fieldsim/imagery.ts';

export const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const DEM_MAX_ZOOM = 14;
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
  return top * (1 - fy) + bottom * fy;
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
