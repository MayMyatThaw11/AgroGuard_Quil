export type OpsAssetKind = 'pump' | 'gate' | 'sluice' | 'drone' | 'tractor' | 'robot';

export type OpsStage = 'Tillering' | 'Panicle Initiation' | 'Flowering' | 'Ripening' | 'Unknown';

export interface OpsAsset {
  id: string;
  number: number;
  kind: OpsAssetKind;
  label: string;
  status: string;
  reading: string | null;
  serves: string[];
  position: [number, number, number];
}

export interface OpsRect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface OpsPaddy {
  id: string;
  cropId: string;
  cropName: string;
  stage: OpsStage;
  daysSincePlanting: number;
  areaHa: number;
  rect: OpsRect;
  ripeness: number;
  ring?: [number, number][];
  osm?: string;
}

export interface OpsWeatherDay {
  rainMm: number;
  tempC: number;
  rhPct: number;
  windMs: number;
}

export interface OpsHistory {
  dates: string[];
  weather: OpsWeatherDay[];
  depthCm: Record<string, number[]>;
  ndvi: Record<string, number[]>;
  today?: string;
}

export interface OpsFarm {
  id: string;
  name: string;
  country: string;
  region: string;
  lat?: number;
  lon?: number;
  standard: string;
  paddies: OpsPaddy[];
  assets: OpsAsset[];
}

export interface ForecastBand {
  p10: number[];
  p50: number[];
  p90: number[];
}

export interface OpsBacktest {
  holdout_days: number;
  series_scored: number;
  candidates: Record<string, number>;
  neural_candidate: string;
  mae_model: number;
  mae_persistence: number;
  skill_vs_persistence: number;
  band_coverage?: Record<string, { inside: number; n: number }>;
  coverage?: { inside: number; n: number };
  coverage_shown?: boolean;
  note: string;
}

export interface OpsForecast {
  method: string;
  fallback_reason: string | null;
  horizon_days: number;
  series: Record<string, ForecastBand>;
  physics?: {
    rain_gain_cm_per_mm: number;
    below_surface_adjustment_cm_day: number;
    mean_daily_loss_cm: number;
    residual_sigma_cm: number;
  };
  backtest: OpsBacktest | null;
  compute_ms: number;
  provenance: string;
}

export type CrewAgentId = 'water_steward' | 'crop_scout' | 'pest_watcher' | 'harvest_planner' | 'drone_pilot';

export interface CrewMember {
  id: CrewAgentId;
  name: string;
  role: string;
  practice: string;
  voice: string;
  task_count: number;
}

export interface CrewActuation {
  target: 'irrigation_valve' | 'sluice_gate' | 'drone';
  command: string;
}

export interface CrewTask {
  id: string;
  agent: CrewAgentId;
  title: string;
  detail: string;
  day_offset: number;
  date: string;
  priority: 'high' | 'medium' | 'low';
  paddy_id: string | null;
  asset_id: string | null;
  actuation: CrewActuation | null;
  requires_human_approval: boolean;
  blocked_reason: string | null;
  evidence: string[];
  /** False when a number in the text is not backed by the evidence; the task is then held. */
  numbers_checked?: boolean;
  schedule?: TaskSchedule;
}

export interface TaskSchedule {
  status: 'scheduled' | 'blocked' | 'unscheduled' | 'advisory' | 'pending';
  kind?: string;
  duration_h?: number;
  assumed_duration?: boolean;
  gates?: string;
  start?: string;
  end?: string;
  /** Hours of travel to reach this task from the previous one on the same crew or machine. */
  travel_h_before?: number;
  travel_from?: string | null;
}

export interface ScheduleSummary {
  status: string;
  reason?: string;
  solver?: string;
  scheduled?: number;
  blocked?: number;
}

export interface OpsPlan {
  farm_id: string;
  forecast: OpsForecast;
  tasks: CrewTask[];
  crew: CrewMember[];
  paddies_without_action: string[];
  thresholds: Record<string, unknown>;
  approval_policy: string;
  ledger_commit_hash: string;
  schedule?: ScheduleSummary;
}

export interface MissingField {
  field: string;
  reason: string;
}

export interface SourceRef {
  provider: string;
  url: string;
  retrieved_at: string;
  sha256: string;
}

export interface LiveWeatherDay {
  date: string;
  hours: number;
  rain_mm: number;
  temp_c: number;
  rh_pct: number;
  wind_ms: number;
  et0_mm: number;
}

export interface LivePaddy {
  id: string;
  stage?: string | null;
  device_id: string | null;
  source?: 'MEASURED' | 'DERIVED';
  now?: number;
  sigma_cm?: number;
  series?: number[];
  flags?: { observed_at: string; reading_cm: number; predicted_cm: number; kind: string; meaning: string }[];
  sensor?: SensorHealth;
  method?: Record<string, unknown>;
  missing: MissingField[];
}

export type HerdKind = 'fish' | 'shrimp' | 'ducks' | 'poultry' | 'buffalo' | 'cattle' | 'goats';

export interface HerdReading {
  value: number;
  unit: string;
  observed_at: string;
  source: string;
  reporter: string | null;
}

export interface Herd {
  id: string;
  kind: HerdKind;
  species: string | null;
  count: number | null;
  count_now: number | null;
  paddy: string | null;
  min_water_cm?: number;
  min_oxygen_mg_l?: number;
  latest: Partial<Record<'head_count' | 'feed_kg' | 'mortality' | 'dissolved_oxygen_mg_l' | 'water_temp_c', HerdReading>>;
  alerts: string[];
}

export interface SensorHealth {
  device_id: string;
  status: 'ok' | 'attention' | 'silent';
  issues: string[];
  last_seen: string | null;
  age_h?: number;
  battery_v?: number;
}

export interface LivePlan {
  farm_id: string;
  status: 'OK' | 'NO_WEATHER';
  generated_at?: string;
  local_now?: string;
  contract_sha256?: string;
  weather?: {
    source: SourceRef;
    stale: boolean;
    timezone: string;
    licence: string;
    days: LiveWeatherDay[];
    past_days: LiveWeatherDay[];
  };
  paddies?: LivePaddy[];
  herds?: Herd[];
  forecast_series?: Record<string, ForecastBand>;
  tasks: CrewTask[];
  schedule?: ScheduleSummary;
  crew?: CrewMember[];
  thresholds?: Record<string, unknown>;
  approval_policy?: string;
  ledger_commit_hash?: string;
  missing: MissingField[];
}

export interface RehearsalBranch {
  p10: number[];
  p50: number[];
  p90: number[];
  days_below_floor: number;
  first_breach_day: number | null;
}

export interface Rehearsal {
  dates: string[];
  action_day: number;
  target_cm: number;
  floor_cm: number;
  lift_cm: number;
  water_m3: number;
  branches: { hold: RehearsalBranch; act: RehearsalBranch; dry: RehearsalBranch };
  forecast_rain_mm: number;
  status: string;
}

export interface SeasonContext {
  town?: string;
  distance_km?: number;
  spi3?: number | null;
  spi_class?: string | null;
  stress_weight?: 'likely' | 'possible';
  missing?: { field: string; reason: string }[];
}

export interface Outcome {
  measured_cm: number;
  predicted_cm: number;
  error_cm: number;
  inside_band: boolean;
  closer_to: 'act' | 'hold';
  observed_at: string;
}

export interface Proposal {
  proposal_id: string;
  farm_id: string;
  status: 'proposed' | 'approved' | 'rejected';
  created_at: string;
  expires_at: string;
  text: string;
  task: { title?: string; paddy_id?: string | null; asset_id?: string | null; actuation: CrewActuation | null };
  agri_patch: { path: string; from: number; to: number } | null;
  rehearsal?: Rehearsal | null;
  season?: SeasonContext | null;
  outcome?: Outcome | null;
  decided_by?: string;
  decided_at?: string;
  next_step?: string | null;
  ledger_commit_hash?: string;
}

export interface FarmCheckApplication {
  applied_at: string;
  local_time: string | null;
  field: string;
  product: string;
  kind: string;
  flags: string[];
}

export interface FarmCheck {
  farm_id: string;
  backtest: {
    status: string;
    overall?: { pairs: number; model_mae_cm: number; no_change_mae_cm: number } | null;
    seepage_mm_day?: { median: number | null; pairs: number; reason: string | null };
    fields?: { percolation_mm_day: number | null }[];
    missing: MissingField[];
  };
  spray_recent: {
    status: string;
    days?: number;
    days_without_safe_hour?: number;
    missing?: MissingField[];
  };
  inputs: {
    status: string;
    standard?: string | null;
    banned_checked?: boolean;
    applications: FarmCheckApplication[];
    missing: MissingField[];
  };
}

export interface CropProfile {
  id: string;
  name: string;
  category: string;
  countries: string[];
  season_days: number;
  kc: number[] | null;
  kc_source: string;
  key_problems: string[];
  traditional_practices: string[];
  agents: CrewAgentId[];
  notes: string[];
  verification: string;
}

export interface CropCatalog {
  countries: Record<string, string>;
  categories: string[];
  crops: CropProfile[];
}

export interface ActuationVerdict {
  status: 'PENDING_APPROVAL' | 'PERMITTED' | 'REJECTED';
  target: string;
  challenge_token?: string | null;
  gatesPassed: string[];
  failure: { code: string; detail: string } | null;
  ledger_commit_hash?: string;
}
