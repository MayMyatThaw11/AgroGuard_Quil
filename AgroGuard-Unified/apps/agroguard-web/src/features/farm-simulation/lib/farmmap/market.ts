import { request } from '../api.ts';
import type { CropId } from './farmMapTypes.ts';

export type Produce = 'rice' | 'maize' | 'pulses' | 'onion' | 'tomato' | 'chili' | 'potato' | 'vegetables' | 'fruit';
export type OutlookLevel = 'no-buyers' | 'no-data' | 'short' | 'balanced' | 'glut';
export type Channel = 'direct' | 'bulk';
export type Tone = 'ok' | 'watch' | 'risk' | 'info';

export interface MissingValue {
  field: string;
  reason: string;
}

export interface PriceTrend {
  status: 'ok';
  provenance: 'measured' | 'modelled';
  market: string;
  market_km?: number;
  as_of: string | null;
  latest_mmk_kg: number;
  change_3m_pct: number | null;
  unit: string;
  source: { provider: string; url: string | null };
}

export interface Advice {
  id: 'presell-bulk' | 'try-nearby' | 'stagger-harvest' | 'price-fell' | 'plant-other' | 'reach-processors';
  params: Record<string, string | number>;
}

export interface Outlook {
  town: string;
  produce: Produce;
  on: string;
  supply_kg: number;
  demand_kg: number;
  ratio: number | null;
  level: OutlookLevel;
  verdict: string;
  coverage: { listings: number; farmers: number; buyers: number; label: 'early' | 'some' | 'good' };
  price: PriceTrend | MissingValue;
  advice: Advice[];
  nearby: { town: string; km: number; level: OutlookLevel; unmet_kg: number }[];
}

export interface Preorder {
  id: string;
  buyer_name: string | null;
  buyer_kind: string;
  channel: Channel;
  produce: Produce;
  qty_kg: number;
  needed_by: string;
  town: string;
  price_offer_mmk_kg: number | null;
  km?: number;
  demo?: boolean;
}

export interface Pickup {
  booking_id: string;
  beta: true;
  km: number;
  drivers: { name: string; vehicle: string; eta_min: number; rating: number }[];
  steps: string[];
  created_at: string;
}

export interface Offer {
  id: string;
  preorder_id: string;
  listing_id: string;
  status: 'candidate' | 'selected';
  qty_kg: number;
  produce: Produce;
  buyer_name: string | null;
  buyer_kind: string;
  channel: Channel;
  town: string;
  needed_by: string;
  price_offer_mmk_kg: number | null;
  buyer_km: number;
  buyer_lat?: number;
  buyer_lon?: number;
  pickup: Pickup | null;
  created_at: string;
}

export interface Listing {
  id: string;
  produce: Produce;
  qty_kg: number;
  counted_kg: number;
  ready_on: string;
  town: string;
}

const CROP_PRODUCE: Record<CropId, Produce[]> = {
  rice: ['rice'],
  maize: ['maize'],
  veg: ['tomato', 'onion', 'chili', 'potato', 'vegetables', 'pulses'],
  fruit: ['fruit'],
  cassava: ['vegetables'],
  sugarcane: ['vegetables'],
  palm: ['fruit'],
  coffee: ['fruit'],
  tea: ['vegetables'],
};
const TONE: Record<OutlookLevel, Tone> = { short: 'ok', balanced: 'info', glut: 'risk', 'no-buyers': 'watch', 'no-data': 'info' };
const KG_PER_VISS = 1.63293;
const STEP_MS = 40_000;
const BASE = '/api/v1/agriquill/market';

export const outlookTone = (level: OutlookLevel): Tone => TONE[level];
export const produceForCrop = (crop: CropId): Produce[] => CROP_PRODUCE[crop];
export const viss = (kg: number): number => Math.round(kg / KG_PER_VISS);
export const isPrice = (price: PriceTrend | MissingValue): price is PriceTrend => 'latest_mmk_kg' in price;

export function pickupStep(createdAt: string, now: number): number {
  return Math.max(0, Math.min(4, Math.floor((now - Date.parse(createdAt)) / STEP_MS)));
}

export function barWidth(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(2, Math.round((value / max) * 100));
}

export const REACH_KM: Record<Channel, number> = { direct: 50, bulk: 300 };

export function withinReach<T extends { km?: number }>(rows: readonly T[], channel: Channel): T[] {
  return rows.filter((r) => r.km === undefined || r.km <= REACH_KM[channel]);
}

export function sortByDistance<T extends { km?: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const marketEnabled = () => request<{ enabled: boolean }>(`${BASE}/enabled`);
export const getOutlook = (town: string, produce: Produce, on: string) =>
  request<Outlook>(`${BASE}/outlook?${new URLSearchParams({ town, produce, on })}`);
export const getPreorders = (produce: Produce, channel: Channel, lat: number, lon: number) =>
  request<Preorder[]>(`${BASE}/preorders?${new URLSearchParams({ produce, channel, lat: String(lat), lon: String(lon) })}`);
export const postListing = (body: { produce: Produce; qty_kg: number; ready_on: string; town: string; lat: number; lon: number; area_ha?: number }) =>
  request<Listing>(`${BASE}/listings`, json(body));
export const applyToPreorder = (preorderId: string, listingId: string, qtyKg: number) =>
  request<Offer>(`${BASE}/preorders/${encodeURIComponent(preorderId)}/offers`, json({ listing_id: listingId, qty_kg: qtyKg }));
export const getMyOffers = () => request<Offer[]>(`${BASE}/offers/mine`);
export const bookPickup = (offerId: string) => request<Pickup>(`${BASE}/offers/${encodeURIComponent(offerId)}/pickup`, json({}));

export const PRODUCE: readonly Produce[] = ['rice', 'maize', 'pulses', 'onion', 'tomato', 'chili', 'potato', 'vegetables', 'fruit'];
export const SMALL_BUYERS: readonly string[] = ['household', 'retail'];

export interface MyPreorder extends Preorder {
  status: 'open' | 'closed';
  offers: number;
}

export interface Candidate {
  id: string;
  preorder_id: string;
  status: 'candidate' | 'selected';
  qty_kg: number;
  farmer_name: string | null;
  ready_on: string | null;
  farm_town: string | null;
  km: number;
  farm_lat?: number;
  farm_lon?: number;
  pickup: (Pickup & { fare_mmk?: number }) | null;
}

export const kgStep = (buyerKind: string | null): number => (buyerKind && SMALL_BUYERS.includes(buyerKind) ? 1 : 100);

export const postPreorder = (body: { produce: Produce; qty_kg: number; needed_by: string; town: string; lat: number; lon: number; price_offer_mmk_kg?: number }) =>
  request<Preorder>(`${BASE}/preorders`, json(body));
export const myPreorders = () => request<MyPreorder[]>(`${BASE}/preorders/mine`);
export const preorderOffers = (preorderId: string) => request<Candidate[]>(`${BASE}/preorders/${encodeURIComponent(preorderId)}/offers`);
export const selectOffer = (preorderId: string, offerId: string) =>
  request<Candidate>(`${BASE}/preorders/${encodeURIComponent(preorderId)}/offers/${encodeURIComponent(offerId)}/select`, json({}));
