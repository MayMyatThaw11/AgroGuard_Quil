import type { ContractParcel } from '../contractFarm.ts';
import type { SeasonEvent, SeasonPlan, SeasonTrench } from '../api.ts';

export const FAO_HINTS = {
  bundMinCm: 25,
  bundRecommendedCm: 60,
  trenchWidthCm: [50, 180],
  trenchDepthCm: [30, 90],
  refugeSharePct: [5, 12.1],
  source: 'https://www.fao.org/4/AC180E/AC180E07.htm',
} as const;

export const ORYZA_HINTS = { hillsPerM2: 25, plantsPerHill: 5, seedbedDays: 12, source: 'ORYZA2000 IR72 experiment file (IRRI)' } as const;

// Gains tuned by simulation on the modelled paddy (setpoint held within 5 mm after warm-up). TO VERIFY with the real pump.
export const PID_DEFAULTS = { kp: 0.8, ki: 0.1, kd: 0 } as const;

const ARCHIVE_LAG_DAYS = 6;
const DAY_MS = 86_400_000;

export interface SeasonDraft {
  transplant_date: string;
  duration_days: number | null;
  seedbed_days: number | null;
  hills_per_m2: number | null;
  plants_per_hill: number | null;
  regime: 'continuous' | 'awd' | 'pid';
  pid_setpoint_cm: number | null;
  pid_max_mm_day: number | null;
  pid_kp: number;
  pid_ki: number;
  pid_kd: number;
  awd_threshold_cm: number | null;
  reflood_cm: number | null;
  bund_height_cm: number | null;
  trench: SeasonTrench | null;
  fish: boolean;
  percolation_mm_day: number | null;
  soil_n_kg_ha: number | null;
  events: SeasonEvent[];
  weather_years: number[];
}

export type PlanErrorKey =
  | 'farmMap.sim.err.transplant'
  | 'farmMap.sim.err.duration'
  | 'farmMap.sim.err.bund'
  | 'farmMap.sim.err.bundBelowReflood'
  | 'farmMap.sim.err.awdThreshold'
  | 'farmMap.sim.err.pidSetpoint'
  | 'farmMap.sim.err.pidMax'
  | 'farmMap.sim.err.pidAbove'
  | 'farmMap.sim.err.eventOutside'
  | 'farmMap.sim.err.years';

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const at = (date: string) => Date.parse(`${date}T00:00:00Z`);

export function defaultDraft(parcel: ContractParcel, today: Date): SeasonDraft {
  return {
    transplant_date: parcel.planted ?? '',
    duration_days: null,
    seedbed_days: null,
    hills_per_m2: null,
    plants_per_hill: null,
    regime: 'continuous',
    pid_setpoint_cm: null,
    pid_max_mm_day: null,
    pid_kp: PID_DEFAULTS.kp,
    pid_ki: PID_DEFAULTS.ki,
    pid_kd: PID_DEFAULTS.kd,
    awd_threshold_cm: null,
    reflood_cm: null,
    bund_height_cm: null,
    trench: null,
    fish: false,
    percolation_mm_day: null,
    soil_n_kg_ha: null,
    events: [],
    weather_years: [today.getUTCFullYear() - 1],
  };
}

export function replayYears(today: Date, transplant: string, duration: number): number[] {
  const newest = today.getTime() - ARCHIVE_LAG_DAYS * DAY_MS;
  const [, month, day] = transplant.split('-').map(Number);
  const years: number[] = [];
  for (let year = today.getUTCFullYear(); years.length < 5 && year >= 1990; year -= 1) {
    if (Date.UTC(year, month - 1, day) + duration * DAY_MS <= newest) years.push(year);
  }
  return years;
}

export function planErrors(d: SeasonDraft, today: Date): PlanErrorKey[] {
  const errors: PlanErrorKey[] = [];
  const start = at(d.transplant_date);
  if (!d.transplant_date || Number.isNaN(start)) errors.push('farmMap.sim.err.transplant');
  if (d.duration_days === null || d.duration_days < 60 || d.duration_days > 200) errors.push('farmMap.sim.err.duration');
  if (d.bund_height_cm === null || d.bund_height_cm < 5 || d.bund_height_cm > 150) errors.push('farmMap.sim.err.bund');
  else if (d.reflood_cm !== null && d.bund_height_cm <= d.reflood_cm) errors.push('farmMap.sim.err.bundBelowReflood');
  if (d.regime === 'awd' && (d.awd_threshold_cm === null || d.awd_threshold_cm > 0 || d.awd_threshold_cm < -40)) errors.push('farmMap.sim.err.awdThreshold');
  if (d.regime === 'pid') {
    if (d.pid_setpoint_cm === null || d.pid_setpoint_cm < 1 || d.pid_setpoint_cm > 30) errors.push('farmMap.sim.err.pidSetpoint');
    else if (d.bund_height_cm !== null && d.pid_setpoint_cm >= d.bund_height_cm) errors.push('farmMap.sim.err.pidAbove');
    if (d.pid_max_mm_day === null || d.pid_max_mm_day <= 0 || d.pid_max_mm_day > 300) errors.push('farmMap.sim.err.pidMax');
  }
  if (!Number.isNaN(start) && d.duration_days !== null) {
    const first = start - (d.seedbed_days ?? 0) * DAY_MS;
    const last = start + d.duration_days * DAY_MS;
    if (d.events.some((e) => at(e.date) < first || at(e.date) >= last)) errors.push('farmMap.sim.err.eventOutside');
    const allowed = replayYears(today, d.transplant_date, d.duration_days);
    if (!d.weather_years.length || d.weather_years.some((y) => !allowed.includes(y))) errors.push('farmMap.sim.err.years');
  }
  return errors;
}

export function toPlan(d: SeasonDraft): SeasonPlan {
  if (d.duration_days === null || d.bund_height_cm === null) throw new Error('draft is not complete');
  return {
    transplant_date: d.transplant_date,
    duration_days: d.duration_days,
    seedbed_days: d.seedbed_days ?? 0,
    hills_per_m2: d.hills_per_m2,
    plants_per_hill: d.plants_per_hill,
    water: {
      regime: d.regime,
      awd_threshold_cm: d.regime === 'awd' ? d.awd_threshold_cm : null,
      reflood_cm: d.reflood_cm,
      pid: d.regime === 'pid' && d.pid_setpoint_cm !== null && d.pid_max_mm_day !== null ? { setpoint_cm: d.pid_setpoint_cm, kp: d.pid_kp, ki: d.pid_ki, kd: d.pid_kd, max_mm_day: d.pid_max_mm_day } : null,
    },
    bund_height_cm: d.bund_height_cm,
    trench: d.trench,
    fish: d.fish,
    percolation_mm_day: d.percolation_mm_day,
    soil_n_kg_ha: d.soil_n_kg_ha,
    events: [...d.events].sort((a, b) => a.date.localeCompare(b.date)),
    weather_years: d.weather_years,
  };
}

export const isoDay = iso;
