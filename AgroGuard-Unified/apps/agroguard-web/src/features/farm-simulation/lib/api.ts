/**
 * Typed client for the AgriQill FastAPI backend.
 *
 * Base URL comes from VITE_API_BASE (default same-origin, which the Vite dev
 * proxy forwards to the local backend). Every function validates the response
 * shape and throws a plain Error with the server's detail on a non-2xx.
 */

import type { ActuationVerdict, CropCatalog, FarmCheck, LivePlan, OpsPlan, Proposal } from '../data/ops/types';
import { ApiError } from './apiError.ts';
import type { ContractSpec } from './contractFarm.ts';
import type { DailyWeather } from './signinField.ts';

const BASE = (import.meta.env?.VITE_API_BASE ?? '').replace(/\/$/, '');
const ACCESS_CODE_KEY = 'agriquill.accessCode';

export function accessCode(): string {
  try {
    return localStorage.getItem(ACCESS_CODE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAccessCode(code: string): void {
  try {
    if (code) localStorage.setItem(ACCESS_CODE_KEY, code);
    else localStorage.removeItem(ACCESS_CODE_KEY);
  } catch {
    return;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const code = accessCode();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(code ? { 'x-agriquill-write-token': code } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      const raw = body.detail ?? body;
      detail = typeof raw === 'string' ? raw : JSON.stringify(raw);
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

export async function backendHealthy(): Promise<boolean> {
  try {
    const body = await request<{ status: string }>('/api/v1/agriquill/health');
    return body.status === 'ok';
  } catch {
    return false;
  }
}

export interface AuthMe {
  name: string | null;
  roles: string[];
  sign_in_required: boolean;
  farms?: string[] | null;
}

export async function getAuthMe(code?: string): Promise<AuthMe> {
  return request<AuthMe>(
    '/api/v1/agriquill/auth/me',
    code === undefined ? undefined : { headers: { 'x-agriquill-write-token': code } }
  );
}

export async function getTerritoryProfile(lat: number, lon: number) {
  return request<{
    location: { latitude: number; longitude: number; country_code: string };
    soil_profile: { provider: string; layers: unknown[] };
    weather_forecast: { provider: string; forecast_days: number; daily?: DailyWeather[] };
    latency_ms: number;
  }>(`/api/v1/agriquill/territory-profile?lat=${lat}&lon=${lon}`);
}

export async function runSim(parcelId: string, days = 120) {
  return request<{ task_id: string; status: string; check_status_url: string }>(
    '/api/v1/agriquill/sim/run',
    { method: 'POST', body: JSON.stringify({ parcel_id: parcelId, simulation_days: days }) }
  );
}

export async function getSimStatus(taskId: string) {
  return request<{ task_id: string; status: string; result?: unknown; elapsed_ms?: number }>(
    `/api/v1/agriquill/sim/status/${taskId}`
  );
}

export async function validateEvidence(evidence: Record<string, unknown>) {
  return request<{ valid: boolean; quality_flag: string; errors: string[] }>(
    '/api/v1/agriquill/evidence/validate',
    { method: 'POST', body: JSON.stringify({ evidence }) }
  );
}

export async function getEvidencePassport(items: Record<string, unknown>[]) {
  return request<{ known: number; stale: number; conflicted: number; missing: number; total: number }>(
    '/api/v1/agriquill/evidence/passport',
    { method: 'POST', body: JSON.stringify({ items }) }
  );
}

export async function getEto(input: {
  tmax_c: number; tmin_c: number; rh_mean_pct: number;
  wind2_ms: number; solar_mj_m2_day: number; kc?: number;
}) {
  return request<{ et0_mm_day: number; etc_mm_day?: number; equation: string }>(
    '/api/v1/agriquill/agronomy/eto',
    { method: 'POST', body: JSON.stringify(input) }
  );
}

export interface OpsPlanRequest {
  farm_id: string;
  country: string;
  standard: string | null;
  start_date: string;
  paddies: {
    id: string;
    crop_id: string;
    stage: string;
    days_since_planting: number;
    area_ha: number;
    water_depth_cm: number[];
    ndvi: number[];
  }[];
  weather_history: { rain_mm: number; temp_c: number; rh_pct: number; wind_ms: number }[];
  weather_forecast: { rain_mm: number; temp_c: number; rh_pct: number; wind_ms: number }[];
  assets: { id: string; kind: string; label: string; status: string; serves: string[] }[];
  threshold_overrides?: Record<string, number>;
  lat?: number;
  lon?: number;
}

export async function planOperations(body: OpsPlanRequest, signal?: AbortSignal) {
  return request<OpsPlan>('/api/v1/agriquill/ops/plan', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
}

export interface AgentDecisionRequest {
  proposal_id: string;
  agent: string;
  farm_id: string;
  paddy_ids: string[];
  title: string;
  action: string | null;
  decision: 'approved' | 'rejected';
  decided_by: string;
  task_ids: string[];
  evidence: { label: string; value: string; source: string }[];
}

export async function recordAgentDecision(body: AgentDecisionRequest) {
  return request<{ recorded: boolean; ledger_commit_hash: string }>('/api/v1/agriquill/agents/decisions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getCropCatalog(country?: string) {
  const query = country ? `?country=${encodeURIComponent(country)}` : '';
  return request<CropCatalog>(`/api/v1/agriquill/ops/crops${query}`);
}

export interface ActuationRequest {
  target: 'irrigation_valve' | 'sluice_gate' | 'drone';
  parcel_standard: string;
  declared_inputs: string[];
  wind_speed_ms?: number;
  requested_minutes?: number;
  operator_confirmed: boolean;
  approval_pin?: string;
  challenge_token?: string;
  farm_id?: string;
}

export async function evaluateActuation(body: ActuationRequest) {
  return request<ActuationVerdict>('/api/v1/agriquill/actuation/approve', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getLedger() {
  return request<{ valid: boolean; head: string | null; entries: unknown[] }>(
    '/api/v1/agriquill/ledger'
  );
}

export interface LintDiagnostic {
  code: string;
  severity: 'ERROR' | 'WARNING';
  line: number;
  column: number;
  message: string;
  recommendation: string;
}

export async function lintAgri(scriptContent: string, signal?: AbortSignal) {
  return request<{ is_valid: boolean; diagnostics: LintDiagnostic[] }>('/api/v1/agriquill/dsl/lint', {
    method: 'POST',
    body: JSON.stringify({ script_content: scriptContent }),
    signal,
  });
}

export async function getContract(farmId: string) {
  return request<{ farm_id: string; is_valid: boolean; contract: ContractSpec | null; sha256: string }>(
    `/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}`
  );
}

export interface ContractListing {
  farm_id: string;
  name: string | null;
  location: [number, number] | null;
  parcels: number;
  area_ha: number;
  herds: number;
  valid: boolean;
  seed: boolean;
}

export async function listContracts() {
  return request<{ contracts: ContractListing[] }>('/api/v1/agriquill/contracts');
}

export type AssetKind = 'pump' | 'drone' | 'sluice' | 'gate';

export interface OnboardAsset {
  id: string;
  kind: AssetKind;
  label: string;
  serves: string[];
}

export interface OnboardRequest {
  name: string;
  country: string;
  registered_by: string;
  utc_offset?: string;
  standard?: string;
  boundaries?: { filename: string; text?: string; base64?: string };
  fields_csv?: string;
  readings_csv?: string;
  inputs_csv?: string;
  assets?: OnboardAsset[];
}

export interface OnboardDiagnostic {
  code: string;
  severity: string;
  message: string;
  line?: number;
}

export interface ImportResult {
  stored: number;
  duplicate: number;
  assumed_time: number;
  rejected: { line: number; reason: string }[];
}

export interface OnboardResult {
  farm_id: string;
  verdict: { is_valid: boolean; diagnostics: OnboardDiagnostic[] };
  to_verify: number;
  notes: string[];
  readings: ImportResult | null;
  inputs: ImportResult | null;
}

export async function onboardFarm(farmId: string, body: OnboardRequest) {
  return request<OnboardResult>(`/api/v1/agriquill/farms/${encodeURIComponent(farmId)}/onboard`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function planLive(farmId: string, signal?: AbortSignal) {
  return request<LivePlan>(`/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}/plan`, {
    method: 'POST',
    signal,
  });
}

export async function runWatch(farmId: string) {
  return request<{ farm_id: string; proposals: Proposal[]; status: string }>(
    `/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}/watch`,
    { method: 'POST' }
  );
}

export async function getProposals(farmId: string) {
  return request<{ proposals: Proposal[] }>(
    `/api/v1/agriquill/proposals?farm_id=${encodeURIComponent(farmId)}`
  );
}

export async function decideProposal(proposalId: string, decision: 'approved' | 'rejected', decidedBy: string) {
  return request<Proposal>(`/api/v1/agriquill/proposals/${encodeURIComponent(proposalId)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, decided_by: decidedBy }),
  });
}

export interface ReadingRequest {
  device_id: string;
  observed_at: string;
  values: Record<string, number>;
  reporter: string;
  photo_base64?: string;
}

export interface FarmSummary {
  farm_id: string;
  name: string | null;
  contract: { valid: boolean; sha256: string; standard: string | null; parcels: number; area_ha: number; to_verify: number };
  monitoring: { sensor_ok: number; scout_72h: number; model: number; unknown: number; paddies: number } | null;
  weather: { provider: string; sha256: string; retrieved_at: string } | null;
  work: { tasks: number; scheduled: number; blocked: { title: string; reason: string }[] };
  proposals: { open: number; approved: number; rejected: number };
  decisions?: { rehearsed: number; scored: number; inside_band: number; mean_abs_error_cm: number | null; status: string };
  ledger: { valid: boolean; entries: number; head: string };
  missing: { field: string; reason: string }[];
}

export interface HerdRequest {
  id: string;
  kind: string;
  species?: string;
  count: number;
  paddy?: string;
  min_water_cm?: number;
  min_oxygen_mg_l?: number;
  added_by: string;
}

export async function addHerd(farmId: string, body: HerdRequest) {
  return request<{ is_valid: boolean }>(`/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}/herds`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface MonitoringFlag {
  observed_at: string;
  reading_cm: number;
  predicted_cm: number;
  kind: string;
  meaning: string;
}

export interface MonitoringPaddy {
  id: string;
  scout: { value_cm: number; observed_at: string; reporter: string; age_h: number } | null;
  model: {
    depth_cm: number;
    sigma_cm: number;
    source: 'MEASURED' | 'DERIVED' | null;
    flags: MonitoringFlag[];
    series: number[];
    series_dates: string[];
    band: { p10: number[]; p50: number[]; p90: number[] } | null;
    band_dates: string[];
  } | null;
  missing: { field: string; reason: string }[];
}

export interface FarmMonitoring {
  farm_id: string;
  status: string;
  generated_at?: string;
  coverage?: { sensor_ok: number; scout_72h: number; model: number; unknown: number; paddies: number };
  paddies?: MonitoringPaddy[];
  missing?: { field: string; reason: string }[];
}

export interface SatelliteScene {
  scene_id: string;
  datetime: string;
  status: 'clear' | 'cloudy' | 'outside' | 'unavailable';
  ndvi: number | null;
  ndwi: number | null;
  clear_fraction?: number | null;
  scene_cloud_pct?: number | null;
  reason: string | null;
}

export interface FarmSatellite {
  farm_id: string;
  window_days: number;
  parcels: { id: string; series: SatelliteScene[]; missing: { field: string; reason: string }[]; provider?: string }[];
}

export async function getSatellite(farmId: string, days = 60) {
  return request<FarmSatellite>(`/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}/satellite?days=${days}`);
}

export async function getMonitoring(farmId: string) {
  return request<FarmMonitoring>(`/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}/monitoring`);
}

export async function getSummary(farmId: string) {
  return request<FarmSummary>(`/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}/summary`);
}

export async function getFarmCheck(farmId: string) {
  return request<FarmCheck>(`/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}/check`);
}

export async function postReading(body: ReadingRequest) {
  return request<{ stored: unknown[]; rejected: { field: string; reason: string }[] }>(
    '/api/v1/agriquill/telemetry/readings',
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export interface FleetFieldDto {
  id: string;
  coop: string;
  crop: string;
  stage: string;
  water_cm: number;
  lowest_ahead_cm: number;
  ndvi: number;
  area_ha: number;
  offline: boolean;
  status: 'ok' | 'watch' | 'alert' | 'offline';
}

export interface FleetFieldsResponse {
  total: number;
  counts: Record<'ok' | 'watch' | 'alert' | 'offline', number>;
  fields: FleetFieldDto[];
}

export async function getFleetFields(limit = 100, safeDepthCm?: number) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (safeDepthCm !== undefined) query.set('awd_safe_depth_cm', String(safeDepthCm));
  return request<FleetFieldsResponse>(`/api/v1/agriquill/fleet/fields?${query.toString()}`);
}
