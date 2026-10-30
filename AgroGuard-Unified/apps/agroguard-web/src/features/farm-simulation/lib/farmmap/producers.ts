import { ApiError } from '../apiError.ts';
import { request, setProducerToken } from '../api.ts';
import type { StorageLike } from '../paddySettings.ts';
import type { Produce } from './market.ts';
import type { CanOffer, Want } from './seasonMatch.ts';

export type ProducerKind = 'individual' | 'household' | 'group';

export interface DraftCrop {
  produce: Produce;
  harvest_month: number;
  area_ha?: number;
}

export interface ProducerDraft {
  kind: ProducerKind | null;
  name: string;
  members: { name: string }[];
  lat: number | null;
  lon: number | null;
  crops: DraftCrop[];
  village?: string;
  township?: string;
}

export interface Producer {
  id: string;
  kind: ProducerKind;
  name: string;
  members: { name: string; area_ha: number | null }[];
  crops: { produce: Produce; harvest_month: number; area_ha: number | null }[];
  lat: number;
  lon: number;
  owner: string | null;
  manager: string | null;
  manager_revoked: boolean;
  has_pin: boolean;
  wants?: Want[];
  can_offer?: CanOffer[];
}

export interface NearbyProfile {
  id: string;
  name: string;
  kind: ProducerKind;
  members: number;
}

export interface ActivityEntry {
  kind: string;
  timestamp?: string;
  payload: { actor?: string; listing_id?: string };
}

export const ACRES_TO_HA = 0.40468564;
export const MONTHS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const SIZE_CHIPS: readonly { id: string; acres: number }[] = [
  { id: 'under1', acres: 0.9 },
  { id: 'one-three', acres: 3 },
  { id: 'three-ten', acres: 10 },
  { id: 'ten-24', acres: 24 },
];
export const CONSENT_VERSION = 'v1';

const PRODUCER_KEY = 'agriquill.farmMap.producer';
const BASE = '/api/v1/agriquill/market';

export const acresToHa = (acres: number): number => acres * ACRES_TO_HA;
export const haToAcres = (ha: number): number => ha / ACRES_TO_HA;

export function canFinish(draft: ProducerDraft): boolean {
  return (
    draft.kind !== null &&
    draft.name.trim().length > 0 &&
    draft.lat !== null &&
    draft.lon !== null &&
    draft.crops.some((c) => c.harvest_month >= 1 && c.harvest_month <= 12)
  );
}

export function loadActiveProducer(storage: StorageLike | null): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(PRODUCER_KEY);
  } catch {
    return null;
  }
}

export function saveActiveProducer(storage: StorageLike | null, id: string): void {
  if (!storage) return;
  try {
    storage.setItem(PRODUCER_KEY, id);
  } catch {
    return;
  }
}

export function nearbyFrom(error: unknown): NearbyProfile | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  try {
    const body = JSON.parse(error.message) as { profile?: NearbyProfile };
    return body.profile ?? null;
  } catch {
    return null;
  }
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const cleaned = (draft: ProducerDraft) => ({ ...draft, crops: draft.crops.filter((c) => c.harvest_month >= 1) });

export const createProducer = (draft: ProducerDraft, extra: { pin?: string; on_behalf?: boolean; consent?: { read_aloud: boolean; text_version: string; by: string } } = {}) =>
  request<Producer & { claim_code: string }>(`${BASE}/producers`, json('POST', { ...cleaned(draft), ...extra }));
export const planUsage = () => request<{ ha_used: number; ha_limit: number | null }>(`${BASE}/producers/plan`);
export const myProducers = () => request<Producer[]>(`${BASE}/producers/mine`);
export const joinGroup = (id: string, name: string) => request<Producer>(`${BASE}/producers/${encodeURIComponent(id)}/members`, json('POST', { name }));
export const revokeManager = (id: string) => request<Producer>(`${BASE}/producers/${encodeURIComponent(id)}/revoke-manager`, json('POST', {}));
export const verifyPin = (id: string, pin: string) => request<Producer>(`${BASE}/producers/${encodeURIComponent(id)}/pin`, json('POST', { pin }));
export const producerActivity = (id: string) => request<ActivityEntry[]>(`${BASE}/producers/${encodeURIComponent(id)}/activity`);

export async function claimProducer(id: string, code: string, pin: string): Promise<Producer> {
  const out = await request<Producer & { device_token?: string }>(`${BASE}/producers/${encodeURIComponent(id)}/claim`, json('POST', { code, pin }));
  if (out.device_token) setProducerToken(out.device_token);
  return out;
}
