import type { FloodLevel } from '../api.ts';
import { favors, type Favor, type Nearest } from '../farmmap/surroundings.ts';
import type { Key } from '../i18n.ts';

export const FLOOD_WORD: Record<FloodLevel, Key> = { low: 'farmMap.common.low', watch: 'farmMap.status.watch', high: 'farmMap.common.high', unknown: 'farmMap.status.unknown' };

export const WHAT_IF = { min: 0, max: 3, step: 0.25 } as const;

export function lowLyingNotes(near: Nearest, elevationM: number | null): Favor[] {
  return favors(near, elevationM).filter((f) => f.tone === 'watch' && (f.kind === 'river' || f.kind === 'elevation'));
}

export const waterLevelY = (padY: number, depthM: number): number => padY + depthM;
