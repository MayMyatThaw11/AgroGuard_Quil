import { Bug, Droplets, Plane, Sprout, Wheat } from 'lucide-react';
import type { CrewAgentId, CrewTask, OpsHistory, OpsPlan } from '../../data/ops/types.ts';

export const CREW_META: Record<CrewAgentId, { color: string; icon: typeof Droplets; short: string }> = {
  water_steward: { color: 'var(--ops-agent-water)', icon: Droplets, short: 'Water' },
  crop_scout: { color: 'var(--ops-agent-scout)', icon: Sprout, short: 'Scout' },
  pest_watcher: { color: 'var(--ops-agent-pest)', icon: Bug, short: 'Pest' },
  harvest_planner: { color: 'var(--ops-agent-harvest)', icon: Wheat, short: 'Harvest' },
  drone_pilot: { color: 'var(--ops-agent-drone)', icon: Plane, short: 'Drone' },
};

export const PRIORITY_CHIP: Record<CrewTask['priority'], string> = {
  high: 'is-red',
  medium: 'is-amber',
  low: '',
};

export const METHOD_LABEL: Record<string, string> = {
  persistence: 'Persistence',
  'damped-trend': 'Damped trend',
  'water-balance-regression': 'Water-balance model',
  'water-balance+tcn-residual': 'Water balance + TCN neural residual',
  'damped-trend-fallback': 'Damped trend (short history)',
  'contract-live': 'Live water balance + Kalman filter',
};

export function methodLabel(method: string): string {
  return METHOD_LABEL[method] ?? method;
}

export function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function depthForDay(
  plan: OpsPlan | null,
  history: OpsHistory,
  paddyId: string,
  dayOffset: number
): number | undefined {
  const band = plan?.forecast.series[paddyId];
  if (dayOffset >= 0 && band) return band.p50[dayOffset] ?? band.p50[band.p50.length - 1];
  const observed = history.depthCm[paddyId] ?? [];
  return observed[observed.length - 1];
}

export function observedDates(history: OpsHistory, observed: number[]): string[] {
  if (observed.length === 1 && history.today) return [history.today];
  return history.dates.slice(-observed.length);
}

export function tasksForDay(plan: OpsPlan | null, dayOffset: number): CrewTask[] {
  if (!plan) return [];
  return plan.tasks.filter((t) => t.day_offset === Math.max(dayOffset, 0));
}
