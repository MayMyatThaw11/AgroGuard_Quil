/**
 * Typed client for the AgriQill FastAPI backend.
 *
 * Base URL comes from VITE_API_BASE (default same-origin, which the Vite dev
 * proxy forwards to the local backend). Every function validates the response
 * shape and throws a plain Error with the server's detail on a non-2xx.
 */

import type { ActuationVerdict, CropCatalog, FarmCheck, LivePlan, OpsPlan, Proposal } from '../data/ops/types';
import { ApiError, BusyError } from './apiError.ts';
import type { ContractSpec } from './contractFarm.ts';
import { parseRetryAfter } from './http.ts';
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
    let code: string | null = null;
    let explained = false;
    try {
      const body = await res.json();
      const raw = body.detail ?? body;
      explained = typeof body.detail === 'string';
      detail = typeof raw === 'string' ? raw : JSON.stringify(raw);
      code = typeof body.code === 'string' ? body.code : null;
    } catch {
      /* ignore */
    }
    const requestId = res.headers.get('x-request-id');
    const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
    // A 503 that names its cause and gives no Retry-After is a server fault the user must read, not load.
    const busy = res.status === 429 || (res.status === 503 && (retryAfter !== undefined || !explained));
    if (busy) throw new BusyError(res.status, retryAfter ?? null, code, requestId);
    throw new ApiError(detail, res.status, code, requestId);
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
  status?: 'unconfirmed' | 'confirmed' | 'conflicting';
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
    shadow?: { status: 'shadow' | 'promote'; pairs: number; mae_cm?: { one_state: number | null; augmented: number | null }; reason?: string } | null;
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

export interface RadarScene {
  scene_id: string;
  datetime: string;
  relative_orbit: number | null;
  vv_db: number | null;
  call: 'open water' | 'no open water' | null;
  reason?: string | null;
}

export interface FarmRadar {
  farm_id: string;
  shadow: true;
  parcels: {
    id: string;
    series: RadarScene[];
    missing: { field: string; reason: string }[];
    revisit?: { same_orbit_days: number | null; shortest_resolvable_cycle_days: number | null; reason: string | null };
    agreement?: { pairs: number; agree: number | null; chance: number | null; reason: string | null };
  }[];
}

export type FloodLevel = 'low' | 'watch' | 'high' | 'unknown';

export interface RiverCell {
  lat: number;
  lon: number;
  km: number;
  mean_flow: number | null;
  years: number;
  levels?: { q2: number; q5: number; q10: number };
  high_years: number[];
  forecast?: { q2: { chance: number | null; first_date: string | null }; q5: { chance: number | null; first_date: string | null } };
  level: FloodLevel;
  reason?: string;
}

export interface FarmRisk {
  farm_id: string;
  level: FloodLevel;
  provider?: string;
  flood_date?: string | null;
  elevation?: { mean_m: number | null; min_m: number | null; max_m: number | null; within_dem_error: boolean | null; accuracy?: string };
  nearest?: RiverCell;
  main?: RiverCell;
  parcels?: { id: string; advice: { action: 'none' | 'protect' | 'harvest_early'; text: string }; planting: { text: string } | null }[];
  assumptions?: Record<string, string>;
  missing: { field: string; reason: string }[];
}

export async function getRisk(farmId: string) {
  return request<FarmRisk>(`/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}/risk`);
}

export interface HarvestParcel {
  parcel: string;
  crop: string | null;
  tonnes: [number, number] | null;
  area_ha?: number;
  reason?: string;
  yield?: {
    t_ha: number | null;
    t_ha_5y?: [number, number];
    year?: number;
    item?: string;
    flag_meaning?: string;
    backtest?: { within_10: number; n: number; mape_pct: number; years: string; rule: string } | null;
  };
}

export interface HarvestReference {
  farm_id: string;
  country: string | null;
  country_name: string | null;
  parcels: HarvestParcel[];
  note: string;
}

export async function getHarvestReference(farmId: string) {
  return request<HarvestReference>(`/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}/harvest-reference`);
}

export type SeasonKey = 'rainy' | 'hot_dry' | 'cool_dry';

export interface SeasonRun {
  season: SeasonKey;
  from: number;
  to: number;
}

export interface FarmSeasons {
  farm_id: string;
  months: { month: number; rain_mm: number; t_c: number; season: SeasonKey; label: string }[] | null;
  runs: SeasonRun[];
  wet_all_year?: boolean;
  wettest_months?: number[];
  now: { season: SeasonKey; label: string; until_month: number; next: SeasonRun | null } | null;
  month: number;
  rule: string;
  reason?: string;
  period?: string | null;
  note?: string | null;
  source?: { provider: string; url: string; retrieved_at: string; sha256: string } | null;
}

export async function getSeasons(farmId: string) {
  return request<FarmSeasons>(`/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}/seasons`);
}

export interface WaterTotals {
  rain_mm: number;
  transpiration_mm: number;
  evaporation_mm: number;
  percolation_mm: number | null;
}

export interface ParcelFlows {
  id: string;
  stage: string | null;
  water: {
    total: WaterTotals;
    net_mm: number | null;
    unknown: { field: string; reason: string }[];
    method: string;
    days: { date: string; evaporation_bound: string }[];
  };
  methane: {
    kg_ha: number | null;
    range_kg_ha?: [number, number];
    farm_kg?: number | null;
    continuous_flooding_kg_ha?: number;
    saved_vs_flooding_kg_ha?: number;
    regime?: string;
    season_days?: number;
    season_basis?: string;
    assumed?: string[];
    reason?: string;
    source: string;
  };
  nitrogen?: {
    applied_kg_n_ha: number;
    volatilised_kg_n_ha: number;
    leached_kg_n_ha: number;
    n2o_direct_kg_n_ha: number;
    n2o_indirect_kg_n_ha: number;
    remaining_kg_n_ha: number;
    not_counted: number;
    not_counted_reason: string | null;
    source: string;
  };
  climate?: {
    co2e_kg_ha: number | null;
    range_kg_ha?: [number, number];
    left_out?: string[];
    reason?: string;
    source: string;
  };
}

export interface FarmFlows {
  farm_id: string;
  status: string;
  days?: { date: string; et0_mm: number; canopy: { vpd_kpa_mean: number | null; vpd_kpa_max: number | null; wet_hours: number; wet_rule: string } }[];
  parcels?: ParcelFlows[];
  sources?: { water: string; methane: string; weather: string };
  missing?: { field: string; reason: string }[];
}

export async function getFlows(farmId: string) {
  return request<FarmFlows>(`/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}/flows`);
}

export type JobKind ='irrigate' | 'drain' | 'scout' | 'spray' | 'harvest';

export interface PersonaVariation {
  label?: string;
  persona: 'manual' | 'tech';
  crew: number;
  machines?: string[] | null;
  budget?: number | null;
  unit_prices?: Partial<Record<JobKind, number>>;
  inflation_pct?: number;
  durations_h?: Partial<Record<JobKind, number>>;
}

export interface PersonaTask {
  id: string;
  title: string;
  date: string;
  paddy_id: string | null;
  asset_id: string | null;
  manual_kind?: JobKind;
  blocked_reason: string | null;
  cost?: number | null;
  schedule: { status: string; kind?: JobKind; start?: string; duration_h?: number };
}

export interface PersonaPlanResult {
  label: string;
  persona: 'manual' | 'tech';
  crew: number;
  machines: string[];
  own_hours: JobKind[];
  outcome: {
    scheduled: number;
    blocked: { id: string; title: string; reason: string | null }[];
    lateness_h: number;
    by_hand: number;
    solver: string | null;
    cost: {
      priced_total: number;
      unpriced_jobs: number;
      budget: number | null;
      inflation_pct: number;
      within_budget: boolean | null;
      dropped: { id: string; title: string; cost: number; days: number }[];
      note: string | null;
    };
  };
  tasks: PersonaTask[];
}

export interface PersonaPlans {
  farm_id: string;
  status: string;
  plans?: PersonaPlanResult[];
  missing?: { field: string; reason: string }[];
  shared_forecast?: { generated_at: string; weather_source: string };
  approval?: string;
}

export async function getPersonaPlans(farmId: string, variations: PersonaVariation[]) {
  return request<PersonaPlans>(`/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}/persona-plan`, {
    method: 'POST',
    body: JSON.stringify({ variations }),
  });
}

export async function getRadar(farmId: string, days = 60) {
  return request<FarmRadar>(`/api/v1/agriquill/contracts/${encodeURIComponent(farmId)}/radar?days=${days}`);
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
