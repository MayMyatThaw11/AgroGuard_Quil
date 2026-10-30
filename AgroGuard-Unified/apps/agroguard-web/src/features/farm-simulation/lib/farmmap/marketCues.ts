import { request } from '../api.ts';
import type { Key, Translate } from '../i18n.ts';
import type { StorageLike } from '../paddySettings.ts';
import { CROPS } from './farmMapTheme.ts';
import type { CropId } from './farmMapTypes.ts';
import { produceForCrop, type Produce } from './market.ts';
import type { Producer } from './producers.ts';

export type CueKind = 'harvest-soon' | 'new-buyers' | 'processor-posted' | 'season-match' | 'glut-at-planting' | 'supply-match';

export interface Cue {
  id: string;
  kind: CueKind;
  params: Record<string, string | number>;
  issued_on: string;
}

export interface SeasonRecord {
  sold_kg: number;
  avg_mmk_kg: number | null;
  town_avg_mmk_kg: number | null;
  deliveries: number;
  on_time: number;
}

export interface CueState {
  muted: boolean;
  seenAt: string | null;
}

export interface Prefill {
  produce: Produce;
  kg: number | null;
  ready_on: string;
}

const CUES_KEY = 'agriquill.farmMap.cues';
const BASE = '/api/v1/agriquill/market';
const DEFAULT_STATE: CueState = { muted: false, seenAt: null };

export function prefillOffer(profile: Pick<Producer, 'crops'>, crop: CropId, now: Date = new Date()): Prefill {
  const fits = produceForCrop(crop);
  const chosen = profile.crops.find((c) => fits.includes(c.produce)) ?? profile.crops[0];
  const meta = CROPS[crop];
  const midpoint = meta && meta.unit === 't/ha' ? ((meta.yld[0] + meta.yld[1]) / 2) * 1000 : null;
  const kg = chosen.area_ha && midpoint ? Math.max(10, Math.round((chosen.area_ha * midpoint) / 10) * 10) : null;
  const year = now.getUTCFullYear() + (chosen.harvest_month < now.getUTCMonth() + 1 ? 1 : 0);
  return { produce: chosen.produce, kg, ready_on: `${year}-${String(chosen.harvest_month).padStart(2, '0')}-15` };
}

export function cueText(cue: Cue, t: Translate, produceWord: (p: Produce) => string, weight: (kg: number) => string): string {
  const p = cue.params;
  const produce = typeof p.produce === 'string' ? produceWord(p.produce as Produce) : '';
  const kg = typeof p.kg === 'number' ? weight(p.kg) : '';
  return t(`farmMap.cue.${cue.kind}` as Key, { ...p, produce, w: kg });
}

export function seasonText(record: SeasonRecord, t: Translate, weight: (kg: number) => string): string | null {
  if (!record.sold_kg) return null;
  const w = weight(record.sold_kg);
  if (!record.avg_mmk_kg) return t('farmMap.season.record.noprice', { w });
  const price = record.avg_mmk_kg.toLocaleString('en');
  const diff = record.town_avg_mmk_kg === null ? 0 : record.avg_mmk_kg - record.town_avg_mmk_kg;
  if (!diff) return t('farmMap.season.record.plain', { w, price });
  return t(diff > 0 ? 'farmMap.season.record.above' : 'farmMap.season.record.below', { w, price, diff: Math.abs(diff).toLocaleString('en') });
}

export const showCue = (cue: Cue, state: CueState): boolean => !state.muted && (state.seenAt === null || cue.issued_on > state.seenAt);

export function loadCueState(storage: StorageLike | null | undefined): CueState {
  if (!storage) return DEFAULT_STATE;
  try {
    const raw = storage.getItem(CUES_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<CueState>) : null;
    return { muted: saved?.muted === true, seenAt: typeof saved?.seenAt === 'string' ? saved.seenAt : null };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveCueState(storage: StorageLike | null | undefined, state: CueState): void {
  if (!storage) return;
  try {
    storage.setItem(CUES_KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

export const getCues = (producerId: string, since: string | null) =>
  request<Cue[]>(`${BASE}/cues?${new URLSearchParams({ producer_id: producerId, ...(since ? { since } : {}) })}`);
export const getSeason = (producerId: string) => request<SeasonRecord>(`${BASE}/producers/${encodeURIComponent(producerId)}/season`);
