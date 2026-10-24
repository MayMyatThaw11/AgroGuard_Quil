import type { SeasonEvent } from '../api.ts';
import type { Sun } from '../farmmap/sun.ts';

const MIN_SUN_DEG = 5;

export function weedDensity(events: readonly SeasonEvent[], date: string): number {
  let density = 0;
  for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.date > date) break;
    if (e.kind === 'weed_emergence') density += e.density_m2;
    if (e.kind === 'weed') density *= 1 - e.removed_pct / 100;
  }
  return density;
}

export function sunPosition(sun: Sun, radius: number): [number, number, number] {
  const elevation = (Math.max(MIN_SUN_DEG, sun.elevationDeg) * Math.PI) / 180;
  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  return [Math.sin(azimuth) * Math.cos(elevation) * radius, Math.sin(elevation) * radius, -Math.cos(azimuth) * Math.cos(elevation) * radius];
}
