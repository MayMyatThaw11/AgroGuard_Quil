import type { Position } from './farmMapTypes.ts';

export function rng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

export function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function offset(lat: number, lon: number, degrees: number, distance: number): [number, number] {
  const angle = (degrees * Math.PI) / 180;
  return [lat + Math.cos(angle) * distance, lon + (Math.sin(angle) * distance) / Math.cos((lat * Math.PI) / 180)];
}

export function chunkKey(lat: number, lon: number): string {
  return `${Math.floor(lat)}:${Math.floor(lon)}`;
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channels = [n >> 16, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount)))),
  );
  return `#${channels.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function blob(lat: number, lon: number, radiusDeg: number, seed: number, vertices: number): Position[] {
  const random = rng(seed);
  const points: Position[] = [];
  for (let i = 0; i <= vertices; i += 1) {
    const angle = (i / vertices) * Math.PI * 2;
    const r = radiusDeg * (0.75 + random() * 0.45);
    points.push([+(lon + (Math.sin(angle) * r) / Math.cos((lat * Math.PI) / 180)).toFixed(5), +(lat + Math.cos(angle) * r).toFixed(5)]);
  }
  points[points.length - 1] = points[0];
  return points;
}
