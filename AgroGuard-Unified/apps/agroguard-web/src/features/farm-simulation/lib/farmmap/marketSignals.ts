import { request } from '../api.ts';
import type { Translate } from '../i18n.ts';
import type { MissingValue, Produce } from './market.ts';

export type ReadySource = 'season-plan' | 'profile-month';
export type KgSource = 'national-range' | 'fao-official' | 'typical-yield';

export interface Signals {
  ready_on: { date: string; source: ReadySource } | MissingValue;
  expected_kg: { kg: number; source: KgSource } | MissingValue;
  grade: { grade_risk: string | null; channel_hint: 'processor' | null; advice: 'processor-for-grade' | null };
  market_open: boolean;
}

export interface PlantIdea {
  produce: Produce;
  agronomy_fit: 'suitable' | 'conditional';
  demand_kg: number;
  share: 'part';
}

export const hasReady = (v: Signals['ready_on']): v is { date: string; source: ReadySource } => 'date' in v;
export const hasKg = (v: Signals['expected_kg']): v is { kg: number; source: KgSource } => 'kg' in v;

export function readyText(ready: Signals['ready_on'], t: Translate, locale: string): string | null {
  if (!hasReady(ready)) return null;
  const date = new Date(`${ready.date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return t(ready.source === 'season-plan' ? 'farmMap.signals.readyPlan' : 'farmMap.signals.readyMonth', { date });
}

const KG_KEY = { 'fao-official': 'farmMap.signals.kgOfficial', 'national-range': 'farmMap.signals.kgNational', 'typical-yield': 'farmMap.signals.kgTypical' } as const;

export function kgText(expected: Signals['expected_kg'], t: Translate, weight: (kg: number) => string): string | null {
  return hasKg(expected) ? t(KG_KEY[expected.source], { w: weight(expected.kg) }) : null;
}

export function checkText(check: { expected_kg: number } | null | undefined, entered: number, t: Translate, weight: (kg: number) => string): string | null {
  return check ? t('farmMap.signals.check', { expected: weight(check.expected_kg), entered: weight(entered) }) : null;
}

export const plantText = (idea: PlantIdea, t: Translate, weight: (kg: number) => string, produceWord: string): string =>
  t('farmMap.signals.plant', { produce: produceWord, w: weight(idea.demand_kg) });

const BASE = '/api/v1/agriquill/market';
export const getSignals = (producerId: string, produce: Produce, severity?: string | null) =>
  request<Signals>(`${BASE}/signals?${new URLSearchParams({ producer_id: producerId, produce, ...(severity ? { severity } : {}) })}`);
export const getPlantIdeas = (producerId: string, month: number) =>
  request<PlantIdea[]>(`${BASE}/plant-ideas?${new URLSearchParams({ producer_id: producerId, month: String(month) })}`);
