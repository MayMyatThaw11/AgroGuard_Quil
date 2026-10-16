import { WIND_CEILING_MS } from './safety.ts';

export const STORAGE_KEY = 'agriquill.paddySettings';
export const SCHEMA_VERSION = 1;
export const THRESHOLD_STATUS = 'TO VERIFY against local extension guidance before field use';

export type ThresholdKey =
  | 'awd_safe_depth_cm'
  | 'awd_reflood_target_cm'
  | 'flowering_min_depth_cm'
  | 'overflow_depth_cm'
  | 'rain_hold_mm'
  | 'ndvi_drop_per_10_days'
  | 'blast_rh_pct'
  | 'blast_temp_min_c'
  | 'blast_temp_max_c'
  | 'blast_consecutive_days'
  | 'dry_day_rain_mm'
  | 'harvest_dry_days'
  | 'harvest_early_days'
  | 'rice_salinity_threshold_ds_m'
  | 'spray_wind_calm_floor_ms'
  | 'spray_wind_advisory_ms';

export type ThresholdGroupId = 'water' | 'weather' | 'harvest' | 'wind' | 'salinity';

export type ThresholdValues = Readonly<Record<ThresholdKey, number>>;

export interface ThresholdMeta {
  readonly key: ThresholdKey;
  readonly label: string;
  readonly unit: string;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly integer: boolean;
  readonly group: ThresholdGroupId;
  readonly description: string;
  readonly provenance: string;
}

export interface ThresholdGroup {
  readonly id: ThresholdGroupId;
  readonly label: string;
  readonly blurb: string;
}

export interface ValidationIssue {
  readonly key: ThresholdKey;
  readonly level: 'error' | 'warning';
  readonly message: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PROVENANCE = `Default from the planner. Range is a UI guardrail. ${THRESHOLD_STATUS}.`;

function meta(
  key: ThresholdKey,
  label: string,
  unit: string,
  defaultValue: number,
  min: number,
  max: number,
  step: number,
  group: ThresholdGroupId,
  description: string,
  integer = false
): ThresholdMeta {
  return { key, label, unit, defaultValue, min, max, step, integer, group, description, provenance: PROVENANCE };
}

export const THRESHOLD_GROUPS: readonly ThresholdGroup[] = [
  { id: 'water', label: 'Water and AWD', blurb: 'Standing water depth that triggers drying, re-flooding and drainage.' },
  { id: 'weather', label: 'Weather and blast', blurb: 'Canopy decline and leaf-wetness conditions that raise rice blast risk.' },
  { id: 'harvest', label: 'Harvest', blurb: 'Dry-spell rules used to schedule harvest.' },
  { id: 'wind', label: 'Spray wind', blurb: 'Wind limits for drone spraying. The 5.5 m/s hard ceiling is fixed.' },
  { id: 'salinity', label: 'Salinity', blurb: 'Soil salinity level above which rice is flagged.' },
];

export const THRESHOLDS: readonly ThresholdMeta[] = [
  meta('awd_safe_depth_cm', 'AWD safe depth', 'cm', -15, -30, -1, 1, 'water', 'Water level below the soil surface at which the paddy is re-flooded.'),
  meta('awd_reflood_target_cm', 'Re-flood target', 'cm', 5, 0, 15, 0.5, 'water', 'Standing depth to reach when re-flooding.'),
  meta('flowering_min_depth_cm', 'Flowering minimum depth', 'cm', 3, 0, 10, 0.5, 'water', 'Lowest standing depth allowed during flowering.'),
  meta('overflow_depth_cm', 'Overflow depth', 'cm', 10, 5, 30, 1, 'water', 'Standing depth above which drainage is proposed.'),
  meta('rain_hold_mm', 'Rain hold', 'mm', 20, 0, 100, 1, 'water', 'Forecast rain that holds irrigation.'),
  meta('ndvi_drop_per_10_days', 'NDVI drop per 10 days', 'NDVI', 0.05, 0.01, 0.3, 0.01, 'weather', 'Canopy decline that raises a scouting task.'),
  meta('blast_rh_pct', 'Blast humidity', '%', 90, 60, 100, 1, 'weather', 'Relative humidity at or above which blast risk accrues.'),
  meta('blast_temp_min_c', 'Blast minimum temperature', '°C', 20, 10, 35, 0.5, 'weather', 'Lower edge of the blast-favourable temperature band.'),
  meta('blast_temp_max_c', 'Blast maximum temperature', '°C', 28, 15, 40, 0.5, 'weather', 'Upper edge of the blast-favourable temperature band.'),
  meta('blast_consecutive_days', 'Blast consecutive days', 'days', 2, 1, 7, 1, 'weather', 'Days in a row inside the band before a blast alert.', true),
  meta('dry_day_rain_mm', 'Dry-day rain limit', 'mm', 2, 0, 10, 0.5, 'harvest', 'Daily rain at or below which a day counts as dry.'),
  meta('harvest_dry_days', 'Dry days before harvest', 'days', 3, 1, 10, 1, 'harvest', 'Consecutive dry days needed to schedule harvest.', true),
  meta('harvest_early_days', 'Early harvest window', 'days', 3, 1, 14, 1, 'harvest', 'Days before maturity in which harvest may start.', true),
  meta('rice_salinity_threshold_ds_m', 'Rice salinity threshold', 'dS/m', 3, 0.5, 10, 0.1, 'salinity', 'Soil salinity above which rice is flagged.'),
  meta('spray_wind_calm_floor_ms', 'Spray calm floor', 'm/s', 1.3, 0, 5, 0.1, 'wind', 'Wind below this is too still for drift-safe spraying.'),
  meta('spray_wind_advisory_ms', 'Spray wind advisory', 'm/s', 3, 0.1, WIND_CEILING_MS, 0.1, 'wind', 'Wind above this raises an advisory before the hard ceiling.'),
];

export const DEFAULT_VALUES: ThresholdValues = Object.freeze(
  Object.fromEntries(THRESHOLDS.map((entry) => [entry.key, entry.defaultValue]))
) as ThresholdValues;

const META_BY_KEY = new Map<string, ThresholdMeta>(THRESHOLDS.map((entry) => [entry.key, entry]));

const EPSILON = 1e-9;

function decimalsOf(step: number): number {
  return String(step).split('.')[1]?.length ?? 0;
}

function roundToStep(value: number, step: number): number {
  return Number(value.toFixed(decimalsOf(step)));
}

function issue(key: ThresholdKey, level: ValidationIssue['level'], message: string): ValidationIssue {
  return { key, level, message };
}

function checkRange(entry: ThresholdMeta, value: number): ValidationIssue | null {
  if (!Number.isFinite(value)) return issue(entry.key, 'error', `${entry.label} must be a number.`);
  if (entry.integer && (value < 1 || !Number.isInteger(value))) {
    return issue(entry.key, 'error', `${entry.label} must be a whole number of days, at least 1.`);
  }
  if (value < entry.min || value > entry.max) {
    const ceiling = entry.key === 'spray_wind_advisory_ms' ? ` The hard ceiling is ${WIND_CEILING_MS} m/s.` : '';
    return issue(entry.key, 'error', `${entry.label} must be between ${entry.min} and ${entry.max} ${entry.unit}.${ceiling}`);
  }
  return null;
}

export function validate(values: ThresholdValues): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const entry of THRESHOLDS) {
    const found = checkRange(entry, values[entry.key]);
    if (found) issues.push(found);
  }
  const hasError = (key: ThresholdKey) => issues.some((entry) => entry.key === key && entry.level === 'error');
  if (!hasError('spray_wind_calm_floor_ms') && !hasError('spray_wind_advisory_ms')) {
    if (values.spray_wind_calm_floor_ms >= values.spray_wind_advisory_ms) {
      issues.push(issue('spray_wind_calm_floor_ms', 'error', 'Spray calm floor must stay below the spray wind advisory.'));
    }
  }
  if (!hasError('blast_temp_min_c') && !hasError('blast_temp_max_c')) {
    if (values.blast_temp_min_c >= values.blast_temp_max_c) {
      issues.push(issue('blast_temp_min_c', 'error', 'Blast minimum temperature must stay below the maximum.'));
    }
  }
  if (values.awd_reflood_target_cm > values.overflow_depth_cm) {
    issues.push(issue('awd_reflood_target_cm', 'warning', 'Re-flood target is deeper than the overflow depth, so a re-flood would trigger drainage.'));
  }
  if (values.flowering_min_depth_cm > values.overflow_depth_cm) {
    issues.push(issue('flowering_min_depth_cm', 'warning', 'Flowering minimum is deeper than the overflow depth.'));
  }
  return issues;
}

export function hasBlockingIssue(issues: readonly ValidationIssue[]): boolean {
  return issues.some((entry) => entry.level === 'error');
}

export function toOverrides(values: ThresholdValues): Partial<Record<ThresholdKey, number>> {
  const overrides: Partial<Record<ThresholdKey, number>> = {};
  for (const entry of THRESHOLDS) {
    const rounded = roundToStep(values[entry.key], entry.step);
    if (Math.abs(rounded - entry.defaultValue) > EPSILON) overrides[entry.key] = rounded;
  }
  return overrides;
}

export function effectiveFromPlan(thresholds: Readonly<Record<string, unknown>> | null | undefined): ThresholdValues {
  const effective: Record<string, number> = { ...DEFAULT_VALUES };
  if (!thresholds) return effective as ThresholdValues;
  for (const entry of THRESHOLDS) {
    const raw = thresholds[entry.key];
    const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
    if (Number.isFinite(parsed)) effective[entry.key] = parsed;
  }
  return effective as ThresholdValues;
}

export function loadSettings(storage: StorageLike | null | undefined): ThresholdValues {
  const values: Record<string, number> = { ...DEFAULT_VALUES };
  if (!storage) return values as ThresholdValues;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return values as ThresholdValues;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return values as ThresholdValues;
    const envelope = parsed as { v?: unknown; values?: unknown };
    if (envelope.v !== SCHEMA_VERSION || typeof envelope.values !== 'object' || envelope.values === null) {
      return values as ThresholdValues;
    }
    for (const [key, value] of Object.entries(envelope.values as Record<string, unknown>)) {
      const entry = META_BY_KEY.get(key);
      if (entry && typeof value === 'number' && checkRange(entry, value) === null) values[key] = value;
    }
  } catch {
    return { ...DEFAULT_VALUES };
  }
  return values as ThresholdValues;
}

export function saveSettings(storage: StorageLike | null | undefined, values: ThresholdValues): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ v: SCHEMA_VERSION, values }));
    return true;
  } catch {
    return false;
  }
}
