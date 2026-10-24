import { SCREENING } from '../farmmap/surroundings.ts';
import type { Key } from '../i18n.ts';
import type { Terrain } from './profile.ts';

export type HeightKind = 'above' | 'near' | 'below';

export interface HeightLine {
  kind: HeightKind;
  m: number;
}

export function heightLine(elevationM: number | null): HeightLine | null {
  if (elevationM === null || !Number.isFinite(elevationM)) return null;
  if (Math.abs(elevationM) <= SCREENING.lowlandM) return { kind: 'near', m: Math.round(elevationM) };
  return elevationM > 0 ? { kind: 'above', m: Math.round(elevationM) } : { kind: 'below', m: Math.round(-elevationM) };
}

export const HEIGHT_KEY: Record<HeightKind, Key> = {
  above: 'farmMap.own.aboveSea',
  near: 'farmMap.farmView.nearSea',
  below: 'farmMap.farmView.belowSea',
};

const TERRAIN_KEYS: Record<Terrain, Key> = {
  flat: 'farmMap.farmView.terrain.flat',
  rolling: 'farmMap.farmView.terrain.rolling',
  hilly: 'farmMap.farmView.terrain.hilly',
  mountainous: 'farmMap.farmView.terrain.mountainous',
  unknown: 'farmMap.farmView.terrain.unknown',
};

export const terrainKey = (terrain: Terrain): Key => TERRAIN_KEYS[terrain];

const EDGE_KM = 0.05;
const TEN_M_PER_KM = 100;

export type DistanceWord = { kind: 'edge' } | { kind: 'metres'; value: number } | { kind: 'km'; value: string };

export function distanceWord(km: number): DistanceWord {
  if (km < EDGE_KM) return { kind: 'edge' };
  const metres = Math.round(km * TEN_M_PER_KM) * 10;
  return metres < 1000 ? { kind: 'metres', value: metres } : { kind: 'km', value: km.toFixed(1) };
}
