import type { FloodLevel } from '../api.ts';
import { favors, type Favor, type Nearest } from '../farmmap/surroundings.ts';
import type { Key } from '../i18n.ts';

export const FLOOD_WORD: Record<FloodLevel, Key> = { low: 'farmMap.common.low', watch: 'farmMap.status.watch', high: 'farmMap.common.high', unknown: 'farmMap.status.unknown' };

export const WHAT_IF = { min: 0, max: 3, step: 0.25 } as const;

export function lowLyingNotes(near: Nearest, elevationM: number | null): Favor[] {
  return favors(near, elevationM).filter((f) => f.tone === 'watch' && (f.kind === 'river' || f.kind === 'elevation'));
}

export const waterLevelY = (padY: number, depthM: number): number => padY + depthM;

export type FloodBasis = 'sea' | 'river';
export type FloodClass = 'dry' | 'may' | 'likely';
export interface FieldHeights {
  min: number;
  median: number;
  max: number;
}

export const DEM_ERROR_M = 6;
export const DEM_ERROR_STATUS = 'TO VERIFY: typical vertical error of the 30 m SRTM-class terrain tiles in flat ASEAN deltas';
export const SEA_BASIS_BELOW_M = 10;
export const FARMER_STEPS_M = [0.5, 1, 2, 3] as const;

export const waterLevelM = (basis: FloodBasis, riseM: number, lowestGroundM: number): number => (basis === 'sea' ? riseM : lowestGroundM + riseM);

export const waterSceneY = (levelM: number, originElevationM: number): number => levelM - originElevationM;

export const floodBasis = (fieldMedianM: number | null): FloodBasis => (fieldMedianM !== null && fieldMedianM < SEA_BASIS_BELOW_M ? 'sea' : 'river');

export function fieldHeights(samples: readonly (number | null)[]): FieldHeights | null {
  const values = samples.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!values.length) return null;
  const mid = values.length / 2;
  const median = values.length % 2 ? values[Math.floor(mid)] : (values[mid - 1] + values[mid]) / 2;
  return { min: values[0], median, max: values[values.length - 1] };
}

export function floodClass(field: FieldHeights, levelM: number, errorM: number): FloodClass {
  if (field.max + errorM < levelM) return 'likely';
  if (field.min - errorM < levelM) return 'may';
  return 'dry';
}
