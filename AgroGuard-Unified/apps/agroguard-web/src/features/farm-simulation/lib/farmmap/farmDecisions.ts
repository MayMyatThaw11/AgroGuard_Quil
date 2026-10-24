import type { Key } from '../i18n.ts';
import { RICE_STAGES } from './farmMapTheme.ts';
import type { CropId, FarmStatus } from './farmMapTypes.ts';

export type DecisionLevel = 'act' | 'watch' | 'ok' | 'info';

export const DECISION_IDS = [
  'water-refill', 'water-drying', 'water-keep', 'rain-hold', 'rain-clear', 'dry-soil', 'weak-crop', 'harvest-tonnes', 'market-haul', 'stage', 'status-risk', 'status-watch',
] as const;

export type DecisionId = (typeof DECISION_IDS)[number];

export interface Decision {
  id: DecisionId;
  level: DecisionLevel;
  params: Record<string, string | number>;
  verify: boolean;
}

export interface DecisionInput {
  crop: CropId;
  status: FarmStatus;
  stageI: number;
  water: number | null;
  safeDepthCm: number;
  moisture: number;
  ndvi: number;
  areaHa: number;
  yieldPerHa: number;
  yieldUnit: string;
  rainDays: readonly { date: string; mm: number }[] | null;
  marketKm: number | null;
}

export const WET_DAY_MM = 1;
export const SOIL_DRY_PCT = 20;
export const NDVI_WEAK = 0.5;

const LEVEL_ORDER: Record<DecisionLevel, number> = { act: 0, watch: 1, ok: 2, info: 3 };
const round1 = (value: number) => Math.round(value * 10) / 10;

const STAGE_WHY: Record<string, Key> = {
  Flooded: 'farmMap.decide.stage.Flooded.why',
  Seedling: 'farmMap.decide.stage.Seedling.why',
  Tillering: 'farmMap.decide.stage.Tillering.why',
  Booting: 'farmMap.decide.stage.Booting.why',
  Heading: 'farmMap.decide.stage.Heading.why',
  Ripening: 'farmMap.decide.stage.Ripening.why',
  Harvested: 'farmMap.decide.stage.Harvested.why',
};

const TEXT: Record<Exclude<DecisionId, 'stage'>, { title: Key; why: Key }> = {
  'water-refill': { title: 'farmMap.decide.waterRefill.title', why: 'farmMap.decide.waterRefill.why' },
  'water-drying': { title: 'farmMap.decide.waterDrying.title', why: 'farmMap.decide.waterDrying.why' },
  'water-keep': { title: 'farmMap.decide.waterKeep.title', why: 'farmMap.decide.waterKeep.why' },
  'rain-hold': { title: 'farmMap.decide.rainHold.title', why: 'farmMap.decide.rainHold.why' },
  'rain-clear': { title: 'farmMap.decide.rainClear.title', why: 'farmMap.decide.rainClear.why' },
  'dry-soil': { title: 'farmMap.decide.drySoil.title', why: 'farmMap.decide.drySoil.why' },
  'weak-crop': { title: 'farmMap.decide.weakCrop.title', why: 'farmMap.decide.weakCrop.why' },
  'harvest-tonnes': { title: 'farmMap.decide.harvest.title', why: 'farmMap.decide.harvest.why' },
  'market-haul': { title: 'farmMap.decide.haul.title', why: 'farmMap.decide.haul.why' },
  'status-risk': { title: 'farmMap.decide.statusRisk.title', why: 'farmMap.decide.statusRisk.why' },
  'status-watch': { title: 'farmMap.decide.statusWatch.title', why: 'farmMap.decide.statusWatch.why' },
};

export function decisionKeys({ id, params }: Pick<Decision, 'id' | 'params'>): { title: Key; why: Key } {
  if (id === 'stage') return { title: 'farmMap.decide.stage.title', why: STAGE_WHY[String(params.stage)] ?? 'farmMap.decide.stage.Flooded.why' };
  return TEXT[id];
}

export interface DecisionFact {
  label: Key;
  value: string;
}

export function decisionFacts({ id }: Pick<Decision, 'id'>, vars: Record<string, string>): DecisionFact[] {
  switch (id) {
    case 'water-refill':
    case 'water-drying':
      return [
        { label: 'farmMap.farm.waterLevel', value: `${vars.level} cm` },
        { label: 'farmMap.farm.awd', value: `${vars.line} cm` },
      ];
    case 'water-keep':
      return [{ label: 'farmMap.farm.waterLevel', value: `${vars.level} cm` }];
    case 'dry-soil':
      return [{ label: 'farmMap.farm.moisture', value: `${vars.moisture} % vol` }];
    case 'weak-crop':
      return [{ label: 'farmMap.farm.ndvi', value: vars.ndvi }];
    case 'harvest-tonnes':
      return [
        { label: 'farmMap.farm.yieldP50', value: `${vars.perHa} t/ha` },
        { label: 'farmMap.common.area', value: `${vars.area} ha` },
      ];
    default:
      return [];
  }
}

export function decisionVars(params: Decision['params'], locale: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (key === 'day') return [key, new Date(`${value}T00:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })];
      return [key, typeof value === 'number' ? value.toLocaleString(locale, { maximumFractionDigits: 1 }) : value];
    }),
  );
}

function waterDecision({ water, safeDepthCm }: DecisionInput): Decision | null {
  if (water === null) return null;
  if (water <= safeDepthCm) return { id: 'water-refill', level: 'act', params: { level: water, line: safeDepthCm }, verify: false };
  if (water < 0) return { id: 'water-drying', level: 'ok', params: { level: water, line: safeDepthCm, gap: round1(water - safeDepthCm) }, verify: false };
  return { id: 'water-keep', level: 'ok', params: { level: water }, verify: false };
}

function rainDecision({ rainDays }: DecisionInput): Decision | null {
  if (!rainDays) return null;
  const wet = rainDays.filter((day) => day.mm >= WET_DAY_MM);
  if (!wet.length) return { id: 'rain-clear', level: 'ok', params: { days: rainDays.length, wet: WET_DAY_MM }, verify: false };
  const heaviest = wet.reduce((best, day) => (day.mm > best.mm ? day : best));
  return { id: 'rain-hold', level: 'watch', params: { day: heaviest.date, mm: round1(heaviest.mm) }, verify: false };
}

const DRAINING_STAGES = ['Ripening', 'Harvested'];

export function decide(input: DecisionInput): Decision[] {
  const rice = input.crop === 'rice';
  const stage = RICE_STAGES[input.stageI]?.[0] ?? RICE_STAGES[0][0];
  const status: Decision | null = input.status === 'risk'
    ? { id: 'status-risk', level: 'act', params: {}, verify: false }
    : input.status === 'watch' ? { id: 'status-watch', level: 'watch', params: {}, verify: false } : null;
  const tip: Decision | null = rice ? { id: 'stage', level: 'info', params: { stage }, verify: false } : null;
  const out: (Decision | null)[] = [status, tip];
  if (!(rice && stage === 'Harvested')) {
    out.push(rice && !DRAINING_STAGES.includes(stage) ? waterDecision(input) : null, rainDecision(input));
    if (!rice && input.moisture < SOIL_DRY_PCT) out.push({ id: 'dry-soil', level: 'act', params: { moisture: input.moisture, line: SOIL_DRY_PCT }, verify: true });
    if (input.ndvi < NDVI_WEAK) out.push({ id: 'weak-crop', level: 'watch', params: { ndvi: input.ndvi, line: NDVI_WEAK }, verify: true });
    if (input.yieldUnit === 't/ha') out.push({ id: 'harvest-tonnes', level: 'info', params: { tonnes: round1(input.yieldPerHa * input.areaHa), perHa: input.yieldPerHa, area: input.areaHa }, verify: false });
    if (input.marketKm !== null) out.push({ id: 'market-haul', level: 'info', params: { km: input.marketKm }, verify: false });
  }
  return out
    .filter((decision): decision is Decision => decision !== null)
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
