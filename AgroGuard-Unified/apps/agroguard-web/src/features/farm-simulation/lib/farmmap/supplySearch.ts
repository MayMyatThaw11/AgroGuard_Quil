import { request } from '../api.ts';
import type { Translate } from '../i18n.ts';
import type { OutlookLevel, Produce } from './market.ts';
import type { FarmerRecord } from './seasonMatch.ts';

export type Band = 'within' | 'slightly-over' | null;

export interface SupplyRow {
  id: string;
  farm: string | null;
  town: string;
  qty_kg: number;
  ready_on: string;
  km: number;
  ask_mmk_kg: number | null;
  price_basis: 'ask' | 'reference' | null;
  landed_low: number | null;
  landed_high: number | null;
  band: Band;
  reliability: FarmerRecord | null;
}

export interface SupplyGroup {
  town: string;
  km: number;
  kg_ready: number;
  listings: SupplyRow[];
}

export interface SupplyResult {
  groups: SupplyGroup[];
  radius_km: number;
  reference_price: { mmk_kg: number; label: 'reference' } | null;
}

export interface SurplusTown {
  town: string;
  km: number;
  level: OutlookLevel;
  supply_kg: number;
  listings: number;
}

export interface SearchQuery {
  produce: Produce;
  lat: number;
  lon: number;
  kg: number;
  budget: string;
  radius: number;
  by: string;
}

const BASE = '/api/v1/agriquill/market';

export function landedText(row: SupplyRow, t: Translate, locale: string): string {
  if (row.landed_low === null) return t('farmMap.supply.noPrice');
  const low = row.landed_low.toLocaleString(locale);
  if (row.landed_high === null || row.landed_high === row.landed_low) return t('farmMap.supply.landedOne', { low });
  return t('farmMap.supply.landed', { low, high: row.landed_high.toLocaleString(locale) });
}

export function basisText(row: SupplyRow, t: Translate, locale: string, reference?: number): string | null {
  if (row.price_basis === 'ask' && row.ask_mmk_kg) return t('farmMap.supply.basisAsk', { price: row.ask_mmk_kg.toLocaleString(locale) });
  if (row.price_basis === 'reference') return t('farmMap.supply.basisRef', { price: (reference ?? row.landed_low ?? 0).toLocaleString(locale) });
  return null;
}

export const bandTone = (band: Band): 'accent' | 'warning' | 'neutral' => (band === 'within' ? 'accent' : band === 'slightly-over' ? 'warning' : 'neutral');

export function searchParams(q: SearchQuery): URLSearchParams {
  const params = new URLSearchParams({ produce: q.produce, lat: String(q.lat), lon: String(q.lon), radius_km: String(q.radius) });
  if (q.kg > 0) params.set('kg', String(q.kg));
  if (q.budget) params.set('budget', q.budget);
  if (q.by) params.set('by', q.by);
  return params;
}

export const searchSupply = (q: SearchQuery) => request<SupplyResult>(`${BASE}/supply?${searchParams(q)}`);
export const saveSearch = (q: SearchQuery) =>
  request<{ id: string }>(`${BASE}/saved-searches`, {
    method: 'POST',
    body: JSON.stringify({ produce: q.produce, lat: q.lat, lon: q.lon, radius_km: q.radius, ...(q.kg > 0 ? { kg: q.kg } : {}), ...(q.budget ? { budget_mmk_kg: Number(q.budget) } : {}) }),
  });
export const getSurplus = (produce: Produce, lat: number, lon: number, on: string) =>
  request<SurplusTown[]>(`${BASE}/surplus?${new URLSearchParams({ produce, lat: String(lat), lon: String(lon), on })}`);
