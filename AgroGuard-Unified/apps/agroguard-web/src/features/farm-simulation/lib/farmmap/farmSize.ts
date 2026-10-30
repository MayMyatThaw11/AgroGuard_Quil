export const SMALL_FARM_MAX_HA = 2;
export const SMALL_MEDIUM_MAX_HA = 10;

export type FarmSizeBand = 'small' | 'small-medium' | 'too-large';

export function farmSizeBand(ha: number): FarmSizeBand {
  if (ha <= SMALL_FARM_MAX_HA) return 'small';
  return ha <= SMALL_MEDIUM_MAX_HA ? 'small-medium' : 'too-large';
}
