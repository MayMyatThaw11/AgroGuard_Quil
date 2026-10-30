import type { Decision, DecisionLevel } from './farmDecisions.ts';
import type { Cue } from './marketCues.ts';
import type { Advice } from './market.ts';

export interface AdviceItem {
  id: Advice['id'] | 'pickup-rain';
  params: Advice['params'];
}

export interface TodayItem {
  key: string;
  source: 'decision' | 'advice' | 'cue';
  level: Exclude<DecisionLevel, 'ok'>;
  topic: string;
  decision?: Decision;
  advice?: AdviceItem;
  cue?: Cue;
}

export interface MotionEnv {
  reducedMotion: boolean;
  saveData: boolean;
  cores: number | null;
}

export const TODAY_MAX = 3;
const LOW_CORES = 4;
const RANK: Record<TodayItem['level'], number> = { act: 0, watch: 1, info: 2 };
const DECISION_TOPIC: Record<Decision['id'], string> = {
  'water-refill': 'water',
  'water-drying': 'water',
  'water-keep': 'water',
  'rain-hold': 'rain',
  'rain-clear': 'rain',
  'dry-soil': 'soil',
  'weak-crop': 'crop',
  'harvest-tonnes': 'harvest',
  'market-haul': 'haul',
  stage: 'stage',
  'status-risk': 'status',
  'status-watch': 'status',
};
const ADVICE_TOPIC: Record<AdviceItem['id'], string> = {
  'presell-bulk': 'sell',
  'reach-processors': 'sell',
  'try-nearby': 'sell-nearby',
  'stagger-harvest': 'store',
  'price-fell': 'price',
  'plant-other': 'plant',
  'pickup-rain': 'rain',
};
const ADVICE_LEVEL: Record<AdviceItem['id'], TodayItem['level']> = {
  'presell-bulk': 'info',
  'reach-processors': 'info',
  'try-nearby': 'info',
  'stagger-harvest': 'info',
  'price-fell': 'watch',
  'plant-other': 'info',
  'pickup-rain': 'watch',
};

export function rankToday(decisions: readonly Decision[], advice: readonly AdviceItem[], cues: readonly Cue[]): TodayItem[] {
  const fromDecisions = decisions
    .filter((d): d is Decision & { level: TodayItem['level'] } => d.level !== 'ok')
    .map((d): TodayItem => ({ key: `decision-${d.id}`, source: 'decision', level: d.level, topic: DECISION_TOPIC[d.id], decision: d }));
  const fromCues = [...cues]
    .sort((a, b) => b.issued_on.localeCompare(a.issued_on))
    .map((c): TodayItem => ({ key: `cue-${c.id}`, source: 'cue', level: 'info', topic: `cue-${c.kind}`, cue: c }));
  const fromAdvice = advice.map((a): TodayItem => ({ key: `advice-${a.id}`, source: 'advice', level: ADVICE_LEVEL[a.id], topic: ADVICE_TOPIC[a.id], advice: a }));
  const ranked = [...fromDecisions, ...fromAdvice, ...fromCues].map((item, index) => ({ item, index })).sort((a, b) => RANK[a.item.level] - RANK[b.item.level] || a.index - b.index);
  const seen = new Set<string>();
  const out: TodayItem[] = [];
  for (const { item } of ranked) {
    if (seen.has(item.topic)) continue;
    seen.add(item.topic);
    out.push(item);
  }
  return out.slice(0, TODAY_MAX);
}

export function readMotionEnv(): MotionEnv {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { connection?: { saveData?: boolean } });
  return {
    reducedMotion: typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: nav?.connection?.saveData === true,
    cores: nav?.hardwareConcurrency ?? null,
  };
}

export function motionAllowed(env: MotionEnv = readMotionEnv()): boolean {
  return !env.reducedMotion && !env.saveData && !(env.cores !== null && env.cores <= LOW_CORES);
}
