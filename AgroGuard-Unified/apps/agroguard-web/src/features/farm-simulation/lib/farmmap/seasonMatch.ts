import { request } from '../api.ts';
import type { Key, Translate } from '../i18n.ts';
import type { Produce } from './market.ts';

export type Fit = 'strong' | 'good' | 'weak';
export type Want = 'cash-at-harvest' | 'pickup-needed' | 'inputs-needed' | 'flexible-date';
export type CanOffer = 'weekly-delivery' | 'grade-sorting' | 'group-volume';
export type BuyerOffer = 'pays-within-3d' | 'pays-within-7d' | 'provides-pickup' | 'provides-crates' | 'advance-inputs';
export type BuyerNeed = 'weekly-supply' | 'sorted-grade' | 'exact-date';
export type PriceKind = 'fixed' | 'floor' | 'town-plus';

export const WANTS: readonly Want[] = ['cash-at-harvest', 'pickup-needed', 'inputs-needed', 'flexible-date'];
export const CAN_OFFER: readonly CanOffer[] = ['weekly-delivery', 'grade-sorting', 'group-volume'];
export const BUYER_OFFERS: readonly BuyerOffer[] = ['pays-within-3d', 'pays-within-7d', 'provides-pickup', 'provides-crates', 'advance-inputs'];
export const BUYER_NEEDS: readonly BuyerNeed[] = ['weekly-supply', 'sorted-grade', 'exact-date'];
export const PRICE_KINDS: readonly PriceKind[] = ['fixed', 'floor', 'town-plus'];

export interface Reason {
  id: 'location' | 'area' | 'price' | 'demand' | 'needs-met';
  params: Record<string, string | number>;
}

export interface SeasonPrice {
  kind: PriceKind;
  mmk_kg?: number;
  plus_pct?: number;
}

export interface BuyerRecord {
  orders: number;
  completed: number;
  cancelled: number;
  median_days_to_pay: number | null;
  new: boolean;
}

export interface FarmerRecord {
  delivered: number;
  on_time: number;
}

export interface SeasonMatch {
  order_id: string;
  produce: Produce;
  buyer_name: string | null;
  buyer_kind: string;
  total_kg: number;
  remaining_kg: number;
  delivery_months: number[];
  town: string;
  km: number;
  price: SeasonPrice;
  grade: 'any' | 'sorted';
  offers: BuyerOffer[];
  needs: BuyerNeed[];
  reasons: Reason[];
  fit: Fit;
  buyer_reliability: BuyerRecord;
  my_reserved_kg: number;
}

export interface SeasonOrder {
  id: string;
  produce: Produce;
  target_kg: number;
  reserved_kg: number;
  delivery_months: number[];
  price: SeasonPrice;
  grade: 'any' | 'sorted';
  offers: BuyerOffer[];
  needs: BuyerNeed[];
  farmers: { name: string; kg: number; status: 'intent' | 'offered'; reliability: FarmerRecord; needs_met: string[] }[];
}

export interface SeasonOrderDraft {
  produce: Produce;
  total_kg: number;
  delivery_months: number[];
  town: string;
  lat: number;
  lon: number;
  price: SeasonPrice;
  grade: 'any' | 'sorted';
  offers: BuyerOffer[];
  needs: BuyerNeed[];
}

const number = (n: number, locale: string) => n.toLocaleString(locale);

export function reasonText(reason: Reason, t: Translate, locale: string): string {
  const p = reason.params;
  if (reason.id === 'needs-met') return t(`farmMap.season.met.${p.by}` as Key);
  if (reason.id === 'location') return t('farmMap.season.reason.location', { km: p.km });
  if (reason.id === 'area') return t('farmMap.season.reason.area', { kg: number(Number(p.kg), locale), share: p.share_pct });
  if (reason.id === 'price') return t('farmMap.season.reason.price', { pct: p.pct });
  return t('farmMap.season.reason.demand');
}

export function priceText(price: SeasonPrice, t: Translate, locale: string): string {
  if (price.kind === 'town-plus' && price.plus_pct) return t('farmMap.season.price.town-plus', { pct: price.plus_pct });
  if (price.kind !== 'town-plus' && price.mmk_kg) return t(`farmMap.season.price.${price.kind}` as Key, { price: number(price.mmk_kg, locale) });
  return t('farmMap.season.price.none');
}

export function buyerRecordText(record: BuyerRecord, t: Translate): string {
  if (record.new) return t('farmMap.season.buyerRel.new');
  const vars = { done: record.completed, orders: record.orders, days: record.median_days_to_pay ?? 0 };
  return t(record.median_days_to_pay === null ? 'farmMap.season.buyerRel.nopay' : 'farmMap.season.buyerRel', vars);
}

export function farmerRecordText(record: FarmerRecord, t: Translate): string {
  return record.delivered ? t('farmMap.season.farmerRel', { done: record.delivered, onTime: record.on_time }) : t('farmMap.season.farmerRel.new');
}

export const progressPct = (reserved: number, target: number): number => (target > 0 ? Math.min(100, Math.round((reserved / target) * 100)) : 0);

export const toggle = <T extends string>(list: readonly T[], id: T): T[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export const monthsLabel = (months: readonly number[], locale: string): string =>
  months.map((m) => new Date(2027, m - 1, 1).toLocaleDateString(locale, { month: 'short' })).join(', ');

export function defaultReserveKg(match: SeasonMatch): number {
  const land = match.reasons.find((r) => r.id === 'area');
  return land ? Math.min(match.remaining_kg, Number(land.params.kg)) : match.remaining_kg;
}

const BASE = '/api/v1/agriquill/market';
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const seasonMatches = (producerId: string) => request<SeasonMatch[]>(`${BASE}/season-orders/matches?${new URLSearchParams({ producer_id: producerId })}`);
export const reserveSeason = (orderId: string, producerId: string, kg: number) =>
  request<{ id: string; status: 'intent' }>(`${BASE}/season-orders/${encodeURIComponent(orderId)}/reserve`, json('POST', { producer_id: producerId, kg }));
export const postSeasonOrder = (draft: SeasonOrderDraft) => request<SeasonOrder>(`${BASE}/season-orders`, json('POST', draft));
export const mySeasonOrders = () => request<SeasonOrder[]>(`${BASE}/season-orders/mine`);
export const markPaid = (offerId: string) => request<{ id: string; paid_on: string }>(`${BASE}/offers/${encodeURIComponent(offerId)}/paid`, json('POST', {}));
export const updateWants = (producerId: string, body: { wants?: Want[]; can_offer?: CanOffer[] }) =>
  request<unknown>(`${BASE}/producers/${encodeURIComponent(producerId)}`, json('PATCH', body));
