import type { TodayItem } from './today.ts';

export type Epistemic = 'observed' | 'inferred' | 'unknown';

const CUE: Record<string, Epistemic> = {
  'new-buyers': 'observed',
  'processor-posted': 'observed',
  'supply-match': 'observed',
  'season-match': 'inferred',
  'harvest-soon': 'inferred',
  'glut-at-planting': 'inferred',
};
const ADVICE: Record<string, Epistemic> = {
  'presell-bulk': 'observed',
  'reach-processors': 'observed',
  'try-nearby': 'inferred',
  'stagger-harvest': 'inferred',
  'price-fell': 'inferred',
  'plant-other': 'inferred',
  'pickup-rain': 'inferred',
};

export function epistemicOf(item: TodayItem): Epistemic {
  if (item.decision) return 'inferred';
  if (item.cue) return CUE[item.cue.kind] ?? 'unknown';
  if (item.advice) return ADVICE[item.advice.id] ?? 'unknown';
  return 'unknown';
}
