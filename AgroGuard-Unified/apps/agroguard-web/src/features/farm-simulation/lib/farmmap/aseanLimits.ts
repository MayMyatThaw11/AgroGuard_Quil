import type { Country } from './farmMapTypes.ts';

export interface Box {
  w: number;
  s: number;
  e: number;
  n: number;
}

export const ASEAN_BOXES: Record<Country, Box> = {
  Myanmar: { w: 92.1, s: 9.5, e: 101.2, n: 28.6 },
  Thailand: { w: 97.3, s: 5.6, e: 105.7, n: 20.5 },
  Vietnam: { w: 102.1, s: 8.4, e: 109.6, n: 23.4 },
  Cambodia: { w: 102.3, s: 10.4, e: 107.7, n: 14.7 },
  Laos: { w: 100.0, s: 13.9, e: 107.7, n: 22.5 },
  Indonesia: { w: 95.0, s: -11.1, e: 141.1, n: 6.1 },
  Malaysia: { w: 99.6, s: 0.8, e: 119.3, n: 7.4 },
  Singapore: { w: 103.6, s: 1.1, e: 104.1, n: 1.5 },
  Philippines: { w: 116.9, s: 4.6, e: 126.7, n: 21.2 },
  Brunei: { w: 114.0, s: 4.0, e: 115.4, n: 5.1 },
  'Timor-Leste': { w: 124.0, s: -9.6, e: 127.4, n: -8.1 },
};

export const VIEW_LIMIT: Box = { w: 94, s: -10, e: 134, n: 23 };
export const MIN_MAP_ZOOM = 3;

export function inAsean(point: { lat: number; lon: number }): boolean {
  return Object.values(ASEAN_BOXES).some((b) => point.lat >= b.s && point.lat <= b.n && point.lon >= b.w && point.lon <= b.e);
}

export function clampCenter(lon: number, lat: number): [number, number] {
  return [Math.min(VIEW_LIMIT.e, Math.max(VIEW_LIMIT.w, lon)), Math.min(VIEW_LIMIT.n, Math.max(VIEW_LIMIT.s, lat))];
}
